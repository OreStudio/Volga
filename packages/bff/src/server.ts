import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import {
  NatsTransport,
  OresClient,
  accountPageSchema,
  deleteAccount,
  listAccountsRequestSchema,
  SUBJECTS,
  listCountriesRequestSchema,
  countryPageSchema,
  changeReasonPageSchema,
  getImagesRequestSchema,
  getImagesResponseSchema,
  imageBytesToBuffer,
  countryHistoryRequestSchema,
  countryHistoryResponseSchema,
  saveCountryRequestSchema,
  saveCountryResponseSchema,
  deleteCountriesRequestSchema,
  deleteCountryResponseSchema,
  mapCountry,
  wireCountrySchema,
  applyEdit,
  toWireTimestamp,
  loginResultSchema,
  selectPartyRequestSchema,
  sessionViewSchema,
  setAccountsLocked,
  NotAuthenticatedError,
  type LoginOutcome,
  type PartySummary,
} from '@volga/protocol';
import { credentialsSchema, deploymentViewSchema, siteStateSchema } from '@volga/contracts';
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

  /**
   * The deployment's plumbing, for the developer page.
   *
   * Absent unless the deployment offers the developer surface, because it names
   * the host, the port and the namespace, and there is no reason for an
   * ordinary deployment to expose any of that to a browser.
   */
  server.get('/api/site/deployment', async (_request, reply) => {
    if (!site.configuration.developerTools) {
      return reply.status(404).send({
        code: 'invalid-request',
        message: 'No developer surface on this deployment.',
      });
    }
    return deploymentViewSchema.parse({
      environment: site.environment,
      configFile: site.source,
      developerTools: site.configuration.developerTools,
      available: site.configuration.environments.map((environment) => ({
        id: environment.id,
        displayName: environment.displayName,
        nonProduction: environment.nonProduction,
      })),
    });
  });

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

  /**
   * Lists one page of countries.
   *
   * The same shape as the accounts route above, deliberately: every entity list
   * takes offset and limit, returns the page and the total, and maps the wire
   * shape to the interface's own. A hundred entities with a hundred route shapes
   * is a hundred chances to differ.
   */
  server.get('/api/countries', async (request) => {
    const session = requireSession(request);
    const query = request.query as Record<string, string | undefined>;
    const input = listCountriesRequestSchema.parse({
      offset: query['offset'] === undefined ? 0 : Number(query['offset']),
      limit: query['limit'] === undefined ? 100 : Number(query['limit']),
      as_of: query['asOf'] ?? '',
    });

    const raw = await session.client.callAuthenticated(
      SUBJECTS.listCountries,
      input,
      countryPageSchema,
    );
    return {
      countries: raw.countries.map(mapCountry),
      totalCount: raw.total_available_count,
    };
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

  /**
   * Creates or amends one country.
   *
   * A save replaces the whole record, so the client sends the record it was
   * looking at with the edits applied, and the audit reason alongside. The
   * version it was looking at is the optimistic lock: a stale one is refused by
   * the service rather than silently overwriting somebody else's change.
   */
  server.post('/api/countries', async (request, reply) => {
    const session = requireSession(request);
    const body = z
      .object({
        data: wireCountrySchema,
        reason: z.string(),
        commentary: z.string().default(''),
      })
      .parse(request.body);

    /*
     * The tenant is the session's, not the client's.
     *
     * The service overwrites it from the request context and never trusts the
     * client, so this is not what enforces the boundary. It matters anyway,
     * because the field has to *decode*: an empty string is not a UUID, and a
     * request that cannot be decoded is refused before any of the service's
     * checks run. A create arrives with no tenant, and would fail as an
     * unexplained refusal rather than as a validation error.
     */
    const saved = {
      ...applyEdit(body.data, {
        alpha3Code: body.data.alpha3_code,
        numericCode: body.data.numeric_code,
        name: body.data.name,
        officialName: body.data.official_name,
        version: body.data.version,
        changeReasonCode: body.reason,
        changeCommentary: body.commentary,
      }),
      tenant_id: body.data.tenant_id.length > 0 ? body.data.tenant_id : session.tenantId,
      // Same reasoning as the tenant: the service stamps the real time, so this
      // only has to be a timestamp the decoder accepts, and an empty string is
      // not one.
      recorded_at: body.data.recorded_at.length > 0 ? body.data.recorded_at : toWireTimestamp(new Date()),
    };

    const response = await session.client.callAuthenticated(
      SUBJECTS.saveCountry,
      saveCountryRequestSchema.parse({ data: saved }),
      saveCountryResponseSchema,
    );
    // A refusal is a refusal, not a failure: the person did nothing wrong, the
    // service said no, and its words are better than ours.
    if (!response.success) {
      return reply.code(409).send({ message: response.message });
    }
    return { ok: true, message: response.message };
  });

  /**
   * Deletes one country by its natural key.
   */
  server.delete('/api/countries/:code', async (request, reply) => {
    const session = requireSession(request);
    const { code } = request.params as { code: string };
    const response = await session.client.callAuthenticated(
      SUBJECTS.deleteCountries,
      deleteCountriesRequestSchema.parse({ alpha2_codes: [code] }),
      deleteCountryResponseSchema,
    );
    if (!response.success) {
      return reply.code(409).send({ message: response.message });
    }
    return { ok: true, message: response.message };
  });

  /**
   * Every version of one country.
   *
   * Newest first, because that is how a person reads a history: what changed
   * last is the question being asked.
   */
  server.get('/api/countries/:code/history', async (request) => {
    const session = requireSession(request);
    const { code } = request.params as { code: string };
    const response = await session.client.callAuthenticated(
      SUBJECTS.countryHistory,
      countryHistoryRequestSchema.parse({ alpha2_code: code }),
      countryHistoryResponseSchema,
    );
    /*
     * The service returns newest first and that is what a person wants: what
     * changed last is the question being asked. It is passed through rather than
     * reordered, because reversing it here quietly made the screen compare the
     * two oldest versions as though they were the current pair.
     */
    return {
      versions: response.history.map(mapCountry),
      message: response.message,
    };
  });

  /**
   * The reasons a write may carry.
   *
   * Fetched from the server rather than declared in the interface, because the
   * set is data: it differs per deployment, and one reason means "changed
   * nothing material" while the rest mean the opposite.
   */
  server.get('/api/change-reasons', async (request) => {
    const session = requireSession(request);
    const query = request.query as Record<string, string | undefined>;
    const response = await session.client.callAuthenticated(
      SUBJECTS.listChangeReasons,
      {
        offset: query['offset'] === undefined ? 0 : Number(query['offset']),
        limit: query['limit'] === undefined ? 200 : Number(query['limit']),
      },
      changeReasonPageSchema,
    );
    return {
      reasons: response.reasons.map((reason) => ({
        code: reason.code,
        description: reason.description,
        categoryCode: reason.category_code,
        appliesToNew: reason.applies_to_new,
        appliesToAmend: reason.applies_to_amend,
        appliesToDelete: reason.applies_to_delete,
        requiresCommentary: reason.requires_commentary,
        displayOrder: reason.display_order,
      })),
    };
  });

  /**
   * One image, by its identifier.
   *
   * Flags live in the assets service as ordinary images, so this is what a flag
   * cell points at. Fetched through the BFF because the browser never reaches
   * NATS, which is the same reason every other read goes through here.
   *
   * Cached hard, and safely: an image's identifier is its identity and its bytes
   * never change, so a record that points at `abc` will always point at the same
   * picture. That also means a page of twenty-five flags costs one request each
   * the first time and none afterwards.
   */
  server.get('/api/images/:id', async (request, reply) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };

    const response = await session.client.callAuthenticated(
      SUBJECTS.getImages,
      getImagesRequestSchema.parse({ image_ids: [id] }),
      getImagesResponseSchema,
    );

    const image = response.images[0];
    if (image === undefined) {
      return reply.code(404).send();
    }

    return reply
      .header('content-type', image.mime_type.length > 0 ? image.mime_type : 'image/svg+xml')
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(imageBytesToBuffer(image.data));
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
