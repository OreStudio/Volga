import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConnectionsStore } from '@volga/connections';
import { buildServer } from './server.js';
import { ConnectionsService } from './connections-service.js';
import { buildConfig } from './config.js';
import { createRateLimiter } from './rate-limit.js';

/**
 * The connections routes, exercised through Fastify's own injection.
 *
 * These screens run before sign-in and they are the ones that touch the store
 * on disk, so the properties worth asserting are that a read never needs the
 * master password, that a write does, and that no credential ever appears in a
 * response body.
 */

const MASTER = 'master-password-123';

let directory: string;
let service: ConnectionsService;
let server: ReturnType<typeof buildServer>;

const config = buildConfig({
  VOLGA_BFF_PORT: 8080,
  VOLGA_BFF_HOST: '127.0.0.1',
  VOLGA_NATS_URL: 'nats://localhost:21805',
  VOLGA_NATS_SUBJECT_PREFIX: 'ores.dev.test',
  VOLGA_NATS_WIRE_FORMAT: 'msgpack',
  // Never used in these tests: nothing here opens a broker connection. They
  // are inline PEM so the config reader treats them as material rather than
  // as paths to open.
  VOLGA_NATS_TLS_CA: '-----BEGIN CERTIFICATE-----\nunused\n-----END CERTIFICATE-----',
  VOLGA_NATS_TLS_CERT: '-----BEGIN CERTIFICATE-----\nunused\n-----END CERTIFICATE-----',
  VOLGA_NATS_TLS_KEY: '-----BEGIN PRIVATE KEY-----\nunused\n-----END PRIVATE KEY-----',
  VOLGA_SESSION_SECRET: 'a-session-secret-long-enough-to-pass',
  VOLGA_SESSION_TTL_SECONDS: 3600,
  VOLGA_COOKIE_SECURE: 'false',
  VOLGA_ALLOWED_ORIGINS: 'http://localhost:5173',
  VOLGA_LOGIN_ATTEMPTS_PER_MINUTE: 100,
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'volga-routes-'));
  service = new ConnectionsService(
    openConnectionsStore({ path: join(directory, 'connections.db') }),
  );
  server = buildServer({
    config,
    connections: service,
    loginLimiter: createRateLimiter({ maxAttempts: 1000, windowSeconds: 60 }),
  });
});

afterEach(async () => {
  await server.close();
  service.close();
  rmSync(directory, { recursive: true, force: true });
});

async function send(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await server.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return { status: response.statusCode, body: response.json() };
}

async function unlock(): Promise<void> {
  const response = await send('POST', '/api/connections/unlock', { masterPassword: MASTER });
  expect(response.status).toBe(200);
}

describe('reading the catalog', () => {
  it('answers before anything is unlocked', async () => {
    const { status, body } = await send('GET', '/api/connections');
    expect(status).toBe(200);
    expect((body as { store: { unlocked: boolean } }).store.unlocked).toBe(false);
  });

  it('reports where the store is, so a person can find it', async () => {
    const { body } = await send('GET', '/api/connections');
    const store = (body as { store: { databasePath: string; source: string } }).store;
    expect(store.databasePath).toBe(join(directory, 'connections.db'));
    expect(store.source).toBe('explicit');
  });

  it('reports a fresh store as uninitialised', async () => {
    const { body } = await send('GET', '/api/connections');
    expect((body as { store: { uninitialised: boolean } }).store.uninitialised).toBe(true);
  });
});

describe('unlocking', () => {
  it('initialises a fresh store with the first password', async () => {
    const { body } = await send('POST', '/api/connections/unlock', { masterPassword: MASTER });
    expect(body).toEqual({ unlocked: true, initialised: true });
  });

  it('rejects a different password afterwards', async () => {
    await unlock();
    const { status, body } = await send('POST', '/api/connections/unlock', {
      masterPassword: 'not the password',
    });
    expect(status).toBe(401);
    expect((body as { code: string }).code).toBe('invalid-credentials');
  });

  it('requires a password', async () => {
    const { status } = await send('POST', '/api/connections/unlock', { masterPassword: '' });
    expect(status).toBe(400);
  });
});

describe('managing environments', () => {
  it('refuses to create one while locked', async () => {
    const { status, body } = await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
    });
    expect(status).toBe(403);
    expect((body as { message: string }).message).toMatch(/Unlock/);
  });

  it('creates, reads, updates and deletes one', async () => {
    await unlock();

    const created = await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
      httpPort: 21000,
      subjectPrefix: 'ores.dev.local1',
      description: 'local development',
      tagNames: ['dev', 'acme'],
    });
    expect(created.status).toBe(200);
    const id = (created.body as { id: string }).id;
    expect((created.body as { endpoint: { httpPort: number } }).endpoint.httpPort).toBe(21000);

    const catalog = await send('GET', '/api/connections');
    expect((catalog.body as { environments: unknown[] }).environments).toHaveLength(1);
    expect((catalog.body as { tags: unknown[] }).tags).toHaveLength(2);

    const updated = await send('PUT', `/api/connections/environments/${id}`, {
      name: 'renamed',
      host: 'changed.test',
      port: 1234,
    });
    expect(updated.status).toBe(200);
    expect((updated.body as { name: string }).name).toBe('renamed');

    const removed = await send('DELETE', `/api/connections/environments/${id}`);
    expect(removed.status).toBe(200);
    const after = await send('GET', '/api/connections');
    expect((after.body as { environments: unknown[] }).environments).toHaveLength(0);
  });

  it('reports a duplicate name as a conflict rather than a crash', async () => {
    await unlock();
    const input = { name: 'same', host: 'h', port: 1 };
    expect((await send('POST', '/api/connections/environments', input)).status).toBe(200);
    const second = await send('POST', '/api/connections/environments', input);
    expect(second.status).toBe(409);
    expect((second.body as { code: string }).code).toBe('invalid-request');
  });

  it('rejects an out-of-range port at the boundary', async () => {
    await unlock();
    const { status } = await send('POST', '/api/connections/environments', {
      name: 'bad',
      host: 'h',
      port: 99_999,
    });
    expect(status).toBe(400);
  });
});

describe('managing connections', () => {
  it('creates one against an environment without exposing a credential', async () => {
    await unlock();
    const environment = await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
    });
    const environmentId = (environment.body as { id: string }).id;

    const created = await send('POST', '/api/connections/connections', {
      name: 'local1: admin',
      username: 'admin',
      password: 'hunter2',
      environmentId,
      tagNames: ['dev'],
    });
    expect(created.status).toBe(200);
    expect((created.body as { encryptedPassword: string | null }).encryptedPassword).not.toBeNull();

    const catalog = await send('GET', '/api/connections');
    const connection = (catalog.body as { connections: { hasSavedPassword: boolean }[] })
      .connections[0];
    // Whether a credential exists is reported; the credential is not.
    expect(connection?.hasSavedPassword).toBe(true);
    expect(JSON.stringify(catalog.body)).not.toContain('hunter2');
    expect(JSON.stringify(catalog.body)).not.toContain('encryptedPassword');
  });

  it('refuses a connection that both names an environment and states a host', async () => {
    await unlock();
    const environment = await send('POST', '/api/connections/environments', {
      name: 'e',
      host: 'h',
      port: 1,
    });
    const { status } = await send('POST', '/api/connections/connections', {
      name: 'confused',
      username: 'u',
      environmentId: (environment.body as { id: string }).id,
      host: 'also-here',
      port: 2,
    });
    expect(status).toBe(400);
  });
});

describe('moving the store', () => {
  it('hands the browser bytes that are a complete store', async () => {
    await unlock();
    await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
    });

    const response = await server.inject({ method: 'GET', url: '/api/connections/database' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('sqlite');
    expect(String(response.headers['content-disposition'])).toContain('attachment');

    // The bytes open as the same store, which is the point of the operation.
    const copy = join(directory, 'saved-elsewhere.db');
    writeFileSync(copy, response.rawPayload);
    const moved = openConnectionsStore({ path: copy });
    try {
      expect(moved.listEnvironments().map((item) => item.name)).toEqual(['local1']);
    } finally {
      moved.close();
    }
  });

  it('imports a store file the person chose', async () => {
    await unlock();
    await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
      tagNames: ['dev'],
    });
    const exported = await server.inject({ method: 'GET', url: '/api/connections/database' });

    // A second, empty server, as if on another machine.
    const otherDirectory = mkdtempSync(join(tmpdir(), 'volga-routes-other-'));
    const otherService = new ConnectionsService(
      openConnectionsStore({ path: join(otherDirectory, 'connections.db') }),
    );
    const otherServer = buildServer({
      config,
      connections: otherService,
      loginLimiter: createRateLimiter({ maxAttempts: 1000, windowSeconds: 60 }),
    });

    try {
      const response = await otherServer.inject({
        method: 'POST',
        url: '/api/connections/import',
        payload: {
          database: exported.rawPayload.toString('base64'),
          sourcePassword: MASTER,
          targetPassword: 'the-destination-master',
          conflict: 'skip',
        },
      });
      expect(response.statusCode).toBe(200);
      const report = response.json() as { environments: number; passwordsDropped: number };
      expect(report.environments).toBe(1);

      const catalog = await otherServer.inject({ method: 'GET', url: '/api/connections' });
      expect((catalog.json() as { environments: unknown[] }).environments).toHaveLength(1);
    } finally {
      await otherServer.close();
      otherService.close();
      rmSync(otherDirectory, { recursive: true, force: true });
    }
  });

  it('reports what an import would do without writing', async () => {
    await unlock();
    await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
    });
    const exported = await server.inject({ method: 'GET', url: '/api/connections/database' });

    // Import the same store back into itself, as a dry run.
    const response = await server.inject({
      method: 'POST',
      url: '/api/connections/import',
      payload: {
        database: exported.rawPayload.toString('base64'),
        sourcePassword: MASTER,
        targetPassword: MASTER,
        dryRun: true,
      },
    });
    expect(response.statusCode).toBe(200);
    const report = response.json() as { dryRun: boolean; environments: number };
    expect(report.dryRun).toBe(true);
    expect(report.environments).toBe(1);

    // Nothing was written.
    const catalog = await send('GET', '/api/connections');
    expect((catalog.body as { environments: unknown[] }).environments).toHaveLength(1);
  });

  it('refuses a file that is not a database', async () => {
    await unlock();
    const response = await server.inject({
      method: 'POST',
      url: '/api/connections/import',
      payload: {
        database: Buffer.from('this is not a database').toString('base64'),
        sourcePassword: MASTER,
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
  });

  it('refuses an empty upload', async () => {
    await unlock();
    const response = await server.inject({
      method: 'POST',
      url: '/api/connections/import',
      payload: { database: 'AA==', sourcePassword: MASTER },
    });
    expect(response.statusCode).toBe(400);
  });

  it('offers a readable snapshot', async () => {
    await unlock();
    await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
    });
    const response = await server.inject({ method: 'GET', url: '/api/connections/snapshot' });
    expect(response.statusCode).toBe(200);
    const snapshot = JSON.parse(response.body) as { kind: string; environments: unknown[] };
    expect(snapshot.kind).toBe('volga.connections.snapshot');
    expect(snapshot.environments).toHaveLength(1);
  });

  it('writes the store to disk that a person can read back', async () => {
    // The store file is a real file at a documented path, which is what makes
    // backing it up a file copy rather than an export format.
    await unlock();
    await send('POST', '/api/connections/environments', {
      name: 'local1',
      host: 'localhost',
      port: 21005,
    });
    const path = join(directory, 'connections.db');
    expect(readFileSync(path).length).toBeGreaterThan(0);
  });
});
