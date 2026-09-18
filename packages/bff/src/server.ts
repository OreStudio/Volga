import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import {
  NatsTransport,
  OresClient,
  accountListSchema,
  deleteAccount,
  listAccountsRequestSchema,
  loginResultSchema,
  httpLoginRequestSchema,
  selectPartyRequestSchema,
  sessionViewSchema,
  setAccountsLocked,
  NotAuthenticatedError,
  type LoginOutcome,
  type PartySummary,
} from '@volga/protocol';
import type { Config } from './config.js';
import { createRateLimiter, type RateLimiter } from './rate-limit.js';
import { createSessionStore, type LiveSession, type SessionStore } from './sessions.js';
import {
  HttpFailure,
  invalidCredentials,
  invalidRequest,
  notAuthenticated,
  toHttpFailure,
} from './errors.js';
import { connectionId as asConnectionId } from '@volga/connections';
import {
  asHttpFailure,
  openConnectionsService,
  type ConnectionsService,
} from './connections-service.js';
import { registerConnectionRoutes } from './connections-routes.js';

/**
 * The browser-facing HTTP server.
 *
 * The browser never speaks msgpack and never sees a wire field name. It sends
 * and receives the JSON contract in `contracts.ts`, and this server is the
 * only place that translates between that contract and the bus.
 */

const SESSION_COOKIE = 'volga_session';

export interface ServerDependencies {
  readonly config: Config;
  readonly sessions?: SessionStore;
  readonly loginLimiter?: RateLimiter;
  /**
   * The connections store, for the screens that run before sign-in.
   *
   * Injected so a test can point it at a temporary file.
   */
  readonly connections?: ConnectionsService;
  /** Injected in tests so no broker is needed. */
  readonly createClient?: (endpoint: ConnectionEndpoint) => {
    client: OresClient;
    connect: () => Promise<void>;
  };
}

/** Where a sign-in attempt should connect. */
export interface ConnectionEndpoint {
  readonly server: string;
  readonly port: number;
  readonly subjectPrefix: string;
}

export function buildServer(dependencies: ServerDependencies): FastifyInstance {
  const { config } = dependencies;
  const sessions =
    dependencies.sessions ??
    createSessionStore({ ttlSeconds: config.session.ttlSeconds });
  // Opened once for the process: the database is this user's, and the master
  // password lives on the instance for as long as the process runs.
  const connections = dependencies.connections ?? openConnectionsService();
  const loginLimiter =
    dependencies.loginLimiter ??
    createRateLimiter({
      maxAttempts: config.loginAttemptsPerMinute,
      windowSeconds: 60,
    });

  const createClient =
    dependencies.createClient ??
    (() => {
      const transport = new NatsTransport({
        server: config.nats.url,
        subjectPrefix: config.nats.subjectPrefix,
        tls: config.nats.tls,
        name: 'volga-bff',
        // The C++ client's library defaults, made explicit so the behaviour is
        // visible here rather than inherited silently.
        reconnectWaitMs: 2_000,
        maxReconnectAttempts: 60,
      });
      return {
        client: new OresClient({ transport, format: config.nats.format }),
        connect: () => transport.connect(),
      };
    });

  const server = Fastify({
    logger: {
      level: process.env['VOLGA_LOG_LEVEL'] ?? 'info',
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

  /** Builds the browser's view of a freshly authenticated login. */
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
    // A store failure has a status of its own; the generic mapper would call
    // it internal and hide the reason.
    const failure =
      error instanceof HttpFailure ? error : toHttpFailure(error);
    if (failure.status >= 500) {
      request.log.error({ err: error }, 'request failed');
    }
    await reply.status(failure.status).send(failure.body);
  });

  void server.register(cookie);

  server.get('/api/health', async () => ({ status: 'ok' }));

  // The connections screens run before sign-in, so these routes are not
  // behind the session guard.
  registerConnectionRoutes(server, connections);

  server.post('/api/session', async (request, reply) => {
    const parsed = httpLoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('A username and password are required.');
    }
    if (!loginLimiter.allow(request.ip)) {
      throw invalidCredentials('Too many attempts. Wait a minute and try again.');
    }

    // The password is either the one typed on the screen or the one saved
    // against the chosen connection. Either way it never reaches the browser
    // from here.
    let password: string;
    try {
      password =
        parsed.data.connectionId.length > 0
          ? connections.store.resolvePassword(
              asConnectionId(parsed.data.connectionId),
              parsed.data.password.length > 0 ? parsed.data.password : undefined,
            )
          : parsed.data.password;
    } catch (error) {
      throw asHttpFailure(error);
    }
    if (password.length === 0) {
      throw invalidRequest('A password is required.');
    }

    const endpoint: ConnectionEndpoint = {
      server: parsed.data.server,
      port: parsed.data.port,
      subjectPrefix: parsed.data.subjectPrefix,
    };
    const { client, connect } = createClient(endpoint);
    try {
      await connect();
      const outcome = await client.login({
        principal: parsed.data.username,
        password,
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

    // The pending state is only meaningful during login, so the expectation
    // the protocol layer needs is reconstructed from the token it holds.
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
    return accountListSchema.parse({
      accounts: page.accounts,
      totalCount: page.totalCount,
    });
  });

  server.post('/api/accounts/:id/lock', async (request) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };
    const results = await setAccountsLocked(session.client, {
      accountIds: [id],
      locked: true,
    });
    return { results };
  });

  server.post('/api/accounts/:id/unlock', async (request) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };
    const results = await setAccountsLocked(session.client, {
      accountIds: [id],
      locked: false,
    });
    return { results };
  });

  server.delete('/api/accounts/:id', async (request) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };
    await deleteAccount(session.client, id);
    return { ok: true };
  });

  server.addHook('onClose', async () => {
    await sessions.destroyAll();
    if (dependencies.connections === undefined) {
      connections.close();
    }
  });

  return server;
}

export { SESSION_COOKIE };
