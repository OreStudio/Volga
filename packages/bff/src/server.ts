import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import {
  NatsTransport,
  OresClient,
  accountPageSchema,
  deleteAccount,
  listAccountsRequestSchema,
  loginResultSchema,
  selectPartyRequestSchema,
  sessionViewSchema,
  setAccountsLocked,
  NotAuthenticatedError,
  type LoginOutcome,
  type PartySummary,
} from '@volga/protocol';
import { credentialsSchema, siteStateSchema } from '@volga/contracts';
import {
  tlsMaterialFor,
  type LoadedSiteConfiguration,
} from './site-config.js';
import type { Config } from './config.js';
import { createRateLimiter, type RateLimiter } from './rate-limit.js';
import { createSessionStore, type LiveSession, type SessionStore } from './sessions.js';
import { invalidCredentials, invalidRequest, notAuthenticated, toHttpFailure, HttpFailure } from './errors.js';

/**
 * The browser-facing HTTP server.
 *
 * The browser speaks JSON and knows nothing about how the application reaches
 * ORE Studio. It is told which environment it is signed in to so it can say so
 * on screen, and that is all: not the host, not the port, not the namespace.
 * A browser that can name a host can ask the server to connect to it, and this
 * one cannot.
 *
 * The environment is chosen when the process starts and never changes, so every
 * route here talks to the same place for as long as the process runs.
 */

const SESSION_COOKIE = 'volga_session';

export interface ServerDependencies {
  readonly config: Config;
  readonly site: LoadedSiteConfiguration;
  readonly sessions?: SessionStore;
  readonly loginLimiter?: RateLimiter;
  /** Injected in tests so no broker is needed. */
  readonly createClient?: () => { client: OresClient; connect: () => Promise<void> };
}

export function buildServer(dependencies: ServerDependencies): FastifyInstance {
  const { config, site } = dependencies;
  const sessions =
    dependencies.sessions ?? createSessionStore({ ttlSeconds: config.session.ttlSeconds });
  const loginLimiter =
    dependencies.loginLimiter ??
    createRateLimiter({ maxAttempts: config.loginAttemptsPerMinute, windowSeconds: 60 });

  const injectedClient = dependencies.createClient;
  const createClient = (): { client: OresClient; connect: () => Promise<void> } => {
    if (injectedClient !== undefined) {
      return injectedClient();
    }
    {
      const tls = tlsMaterialFor(site.configuration, site.environment);
      const transport = new NatsTransport({
        server: `nats://${site.environment.host}:${site.environment.port}`,
        subjectPrefix: site.environment.subjectPrefix,
        tls: {
          ca: readPem(tls.ca, 'VOLGA_SITE_CONFIG tls.ca'),
          cert: readPem(tls.cert, 'VOLGA_SITE_CONFIG tls.cert'),
          key: readPem(tls.key, 'VOLGA_SITE_CONFIG tls.key'),
        },
        name: 'volga-bff',
        // The C++ client's library defaults, made explicit so the behaviour is
        // visible here rather than inherited silently.
        reconnectWaitMs: 2_000,
        maxReconnectAttempts: 60,
      });
      return {
        client: new OresClient({ transport }),
        connect: () => transport.connect(),
      };
    }
  };

  const server = Fastify({
    logger: {
      level: config.logLevel,
      // Never log a credential or a token.
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
    genReqId: () => randomUUID(),
  });

  function readSessionId(request: FastifyRequest): string | undefined {
    return request.cookies[SESSION_COOKIE];
  }

  function setSessionCookie(reply: FastifyReply, id: string): void {
    reply.setCookie(SESSION_COOKIE, id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.session.cookieSecure,
      maxAge: config.session.ttlSeconds,
    });
  }

  function clearSessionCookie(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  function requireSession(request: FastifyRequest): LiveSession {
    const id = readSessionId(request);
    const session = id === undefined ? undefined : sessions.get(id);
    if (session === undefined) {
      throw notAuthenticated();
    }
    return session;
  }

  function sessionResponse(session: LiveSession): unknown {
    return sessionViewSchema.parse({
      username: session.username,
      email: session.email,
      accountId: session.accountId,
      tenantId: session.tenantId,
      tenantName: session.tenantName,
      party: session.party,
      availableParties: session.availableParties,
      accessLifetimeSeconds: session.accessLifetimeSeconds,
      passwordResetRequired: session.passwordResetRequired,
    });
  }

  function loginResult(outcome: LoginOutcome): unknown {
    if (outcome.kind === 'party-selection-required') {
      return loginResultSchema.parse({
        outcome: 'party-required',
        username: outcome.username,
        email: outcome.email,
        accountId: outcome.accountId,
        tenantName: outcome.tenantName,
        availableParties: outcome.availableParties,
        defaultPartyId: outcome.defaultPartyId,
        passwordResetRequired: outcome.passwordResetRequired,
      });
    }
    if (outcome.kind === 'active') {
      return loginResultSchema.parse({
        outcome: 'active',
        session: {
          username: outcome.username,
          email: outcome.email,
          accountId: outcome.accountId,
          tenantId: outcome.tenantId,
          tenantName: outcome.tenantName,
          party: outcome.party,
          availableParties: outcome.availableParties,
          accessLifetimeSeconds: outcome.accessLifetimeSeconds,
          passwordResetRequired: outcome.passwordResetRequired,
        },
      });
    }
    throw invalidCredentials(outcome.message);
  }

  server.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && config.allowedOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      reply
        .header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type');
      await reply.status(204).send();
    }
  });

  server.setErrorHandler(async (error, request, reply) => {
    const failure = error instanceof HttpFailure ? error : toHttpFailure(error);
    if (failure.status >= 500) {
      request.log.error({ err: error }, 'request failed');
    }
    await reply.status(failure.status).send(failure.body);
  });

  void server.register(cookie);

  server.get('/api/health', async () => ({ status: 'ok' }));

  /**
   * What the interface needs to render itself.
   *
   * The environment is named so the interface can say so, and the developer
   * accounts are offered only when the deployment says so. Note what is absent:
   * the host, the port, the namespace and the certificates.
   */
  server.get('/api/site', async () =>
    siteStateSchema.parse({
      appName: 'ORE Studio',
      environment: {
        id: site.environment.id,
        displayName: site.environment.displayName,
        description: site.environment.description,
        nonProduction: site.environment.nonProduction,
      },
      developerTools: site.configuration.developerTools,
      developerAccounts: site.configuration.developerTools
        ? site.configuration.developerAccounts
        : [],
    }),
  );

  server.post('/api/session', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('A username and password are required.');
    }
    if (!loginLimiter.allow(request.ip)) {
      throw invalidCredentials('Too many attempts. Wait a minute and try again.');
    }

    const { client, connect } = createClient();
    try {
      await connect();
      const outcome = await client.login({
        principal: parsed.data.username,
        password: parsed.data.password,
      });

      if (outcome.kind === 'rejected') {
        await client.close().catch(() => undefined);
        throw invalidCredentials(outcome.message);
      }

      const session = sessions.create({
        client,
        session: outcome.kind === 'active' ? outcome : null,
        username: outcome.username,
        email: outcome.email,
        accountId: outcome.accountId,
        tenantId: outcome.kind === 'active' ? outcome.tenantId : '',
        tenantName: outcome.tenantName,
        availableParties: outcome.availableParties,
        accessLifetimeSeconds: outcome.accessLifetimeSeconds,
        passwordResetRequired: outcome.passwordResetRequired,
        sessionId: client.currentSessionId,
      });
      setSessionCookie(reply, session.id);
      return loginResult(outcome);
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  });

  server.get('/api/session', async (request) => sessionResponse(requireSession(request)));

  server.delete('/api/session', async (request, reply) => {
    const id = readSessionId(request);
    if (id !== undefined) {
      await sessions.destroy(id);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  server.post('/api/session/party', async (request) => {
    const session = requireSession(request);
    const parsed = selectPartyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('A partyId is required.');
    }

    const outcome = await session.client.selectParty({
      partyId: parsed.data.partyId,
      expected: {
        kind: 'party-selection-required',
        accountId: session.accountId,
        tenantId: session.tenantId,
        tenantName: session.tenantName,
        username: session.username,
        email: session.email,
        availableParties: session.availableParties as readonly PartySummary[],
        defaultPartyId: null,
        passwordResetRequired: session.passwordResetRequired,
        accessLifetimeSeconds: session.accessLifetimeSeconds,
        sessionId: session.sessionId,
      },
    });

    const activated = sessions.activate(session.id, outcome);
    if (activated === undefined) {
      throw new NotAuthenticatedError('Session ended during party selection');
    }
    return sessionResponse(activated);
  });

  server.get('/api/accounts', async (request) => {
    const session = requireSession(request);
    const query = request.query as Record<string, string | undefined>;
    const input = listAccountsRequestSchema.parse({
      offset: query['offset'] === undefined ? undefined : Number(query['offset']),
      limit: query['limit'] === undefined ? undefined : Number(query['limit']),
    });

    const page = await session.client.listAccounts(input);
    return { accounts: page.accounts, totalCount: page.totalCount };
  });

  server.post('/api/accounts/:id/lock', async (request) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };
    return { results: await setAccountsLocked(session.client, { accountIds: [id], locked: true }) };
  });

  server.post('/api/accounts/:id/unlock', async (request) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };
    return { results: await setAccountsLocked(session.client, { accountIds: [id], locked: false }) };
  });

  server.delete('/api/accounts/:id', async (request) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };
    await deleteAccount(session.client, id);
    return { ok: true };
  });

  server.addHook('onClose', async () => {
    await sessions.destroyAll();
  });

  return server;
}

/**
 * Reads certificate material.
 *
 * A value naming an existing file is read from disk; anything else is treated
 * as inline PEM, so a deployment can supply either.
 */
function readPem(value: string, label: string): string {
  if (value.includes('-----BEGIN')) {
    return value;
  }
  try {
    return readFileSync(value, 'utf8');
  } catch (cause) {
    throw new Error(`Cannot read ${label} at ${value}`, { cause });
  }
}

export { SESSION_COOKIE };
