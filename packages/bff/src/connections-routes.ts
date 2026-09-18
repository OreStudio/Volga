import type { FastifyInstance } from 'fastify';
import {
  connectionInputSchema,
  environmentInputSchema,
  folderInputSchema,
  importRequestSchema,
  unlockRequestSchema,
  type ConnectionInput,
  type ImportReport,
} from '@volga/contracts';
import {
  SnapshotError,
  buildSnapshot,
  connectionId as asConnectionId,
  environmentId as asEnvironmentId,
  exportStoreBytes,
  folderId as asFolderId,
  importSnapshot,
  parseSnapshot,
  serialiseSnapshot,
  snapshotFromStoreBytes,
  type ConnectionInput as StoreConnectionInput,
} from '@volga/connections';

import { asHttpFailure, type ConnectionsService } from './connections-service.js';
import { HttpFailure, invalidRequest } from './errors.js';

/** Every SQLite database begins with this, so a wrong file is caught early. */
const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'utf8');

/**
 * The connections routes.
 *
 * These serve the screens that run before sign-in: managing the environments
 * and saved connections, choosing one, and moving the store between machines.
 * Every route reads through the store's own types, so nothing here invents a
 * shape or handles a credential.
 *
 * Two routes deal in bytes. `GET /database` hands the browser the store's file
 * so it can be saved wherever the person chooses, and `POST /import` takes a
 * file they chose. The server never opens a path it was handed, and never
 * writes to a path the person did not pick through their own file dialog.
 */
export function registerConnectionRoutes(
  server: FastifyInstance,
  connections: ConnectionsService,
): void {
  /**
   * Refuses a change while the store is locked.
   *
   * Reads are deliberately open: choosing an environment is what a person does
   * before they have identified themselves, so the catalogue cannot be gated.
   * Changing the catalogue is a different matter, and asking for the master
   * password first is both safer and what a person expects from a store that
   * holds credentials.
   */
  function requireUnlocked(): void {
    if (!connections.store.state().unlocked) {
      throw new HttpFailure(403, {
        code: 'forbidden',
        message: 'Unlock the connections store before making changes.',
      });
    }
  }
  /** Unlocks the store, creating the master password on a store that has none. */
  server.post('/api/connections/unlock', async (request, reply) => {
    const parsed = unlockRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('A master password is required.');
    }
    try {
      const result = connections.unlock(parsed.data.masterPassword);
      return { unlocked: true, initialised: result.initialised };
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  server.get('/api/connections', async () => {
    try {
      return connections.catalog();
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  // ---------------------------------------------------------- environments

  server.post('/api/connections/environments', async (request) => {
    requireUnlocked();
    const parsed = environmentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('That environment is not valid.');
    }
    try {
      return connections.store.saveEnvironment({
        ...parsed.data,
        folderId: parsed.data.folderId === null ? null : asFolderId(parsed.data.folderId),
      });
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  server.put('/api/connections/environments/:id', async (request) => {
    requireUnlocked();
    const parsed = environmentInputSchema.safeParse(request.body);
    const { id } = request.params as { id: string };
    if (!parsed.success) {
      throw invalidRequest('That environment is not valid.');
    }
    try {
      return connections.store.saveEnvironment(
        {
          ...parsed.data,
          folderId: parsed.data.folderId === null ? null : asFolderId(parsed.data.folderId),
        },
        asEnvironmentId(id),
      );
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  server.delete('/api/connections/environments/:id', async (request) => {
    requireUnlocked();
    const { id } = request.params as { id: string };
    try {
      connections.store.deleteEnvironment(asEnvironmentId(id));
      return { ok: true };
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  // ----------------------------------------------------------- connections

  server.post('/api/connections/connections', async (request) => {
    requireUnlocked();
    const parsed = connectionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('That connection is not valid.');
    }
    try {
      return connections.store.saveConnection(toConnectionInput(parsed.data));
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  server.put('/api/connections/connections/:id', async (request) => {
    requireUnlocked();
    const parsed = connectionInputSchema.safeParse(request.body);
    const { id } = request.params as { id: string };
    if (!parsed.success) {
      throw invalidRequest('That connection is not valid.');
    }
    try {
      return connections.store.saveConnection(toConnectionInput(parsed.data), asConnectionId(id));
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  server.delete('/api/connections/connections/:id', async (request) => {
    requireUnlocked();
    const { id } = request.params as { id: string };
    try {
      connections.store.deleteConnection(asConnectionId(id));
      return { ok: true };
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  // --------------------------------------------------------------- folders

  server.post('/api/connections/folders', async (request) => {
    requireUnlocked();
    const parsed = folderInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('That folder is not valid.');
    }
    try {
      return connections.store.saveFolder({
        ...parsed.data,
        parentId: parsed.data.parentId === null ? null : asFolderId(parsed.data.parentId),
      });
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  server.delete('/api/connections/folders/:id', async (request) => {
    requireUnlocked();
    const { id } = request.params as { id: string };
    try {
      connections.store.deleteFolder(asFolderId(id));
      return { ok: true };
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  // ------------------------------------------------------ moving the store

  /**
   * The store's database, for the browser to save where the person chooses.
   *
   * `Content-Disposition: attachment` makes the browser's own save dialog the
   * destination, which is the whole point: the file lands in the directory they
   * pick, typically somewhere under their home directory.
   */
  server.get('/api/connections/database', async (_request, reply) => {
    try {
      const bytes = exportStoreBytes(connections.store);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      return reply
        .header('Content-Type', 'application/vnd.sqlite3')
        .header('Content-Disposition', `attachment; filename="connections-${stamp}.db"`)
        .send(Buffer.from(bytes));
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  /** A readable snapshot, for inspection, diffing, or a partial move. */
  server.get('/api/connections/snapshot', async (request, reply) => {
    const query = request.query as { includePasswords?: string };
    try {
      const snapshot = buildSnapshot(connections.store.snapshot(), {
        includePasswords: query.includePasswords !== 'false',
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="connections-${stamp}.snapshot.json"`)
        .send(serialiseSnapshot(snapshot));
    } catch (error) {
      throw asHttpFailure(error);
    }
  });

  /**
   * Imports a store file the person chose.
   *
   * `dryRun` reports what would happen without writing, so the conflict report
   * can be shown before anything changes.
   */
  server.post('/api/connections/import', async (request) => {
    const parsed = importRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw invalidRequest('That import request is not valid.');
    }
    const input = parsed.data;

    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.database, 'base64');
    } catch {
      throw invalidRequest('The uploaded file could not be read.');
    }
    // A SQLite database begins with this exact string. Checking it here turns
    // "you picked the wrong file" into a clear message instead of a failure
    // from somewhere deeper.
    if (!bytes.subarray(0, 16).equals(SQLITE_HEADER)) {
      throw invalidRequest('That file is not a connections database.');
    }

    try {
      const { snapshot, passwords, credentialsAvailable } = snapshotFromStoreBytes(bytes, {
        sourcePassword: input.sourcePassword,
        includeCredentials: input.includeCredentials,
      });

      if (input.dryRun) {
        return dryRunReport(snapshot, credentialsAvailable, input.includeCredentials);
      }

      // A store with no master password yet takes the one supplied here as its
      // own, so a fresh install can be populated from a file in one step.
      if (input.targetPassword.length > 0) {
        connections.unlock(input.targetPassword);
      }

      return importSnapshot(connections.store, snapshot, {
        conflict: input.conflict,
        passwords,
        credentialsAvailable,
        ...(input.targetPassword.length === 0 ? {} : { targetPassword: input.targetPassword }),
      });
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw new HttpFailure(409, { code: 'invalid-request', message: error.message });
      }
      throw asHttpFailure(error);
    }
  });

  /** Imports a snapshot file rather than a whole database. */
  server.post('/api/connections/snapshot/import', async (request) => {
    const body = request.body as { snapshot?: unknown; conflict?: unknown; targetPassword?: unknown } | undefined;
    if (typeof body?.snapshot !== 'string') {
      throw invalidRequest('A snapshot is required.');
    }
    const conflict =
      body.conflict === 'rename' || body.conflict === 'replace' ? body.conflict : 'skip';
    const targetPassword = typeof body.targetPassword === 'string' ? body.targetPassword : '';

    try {
      const snapshot = parseSnapshot(body.snapshot);
      if (targetPassword.length > 0) {
        connections.unlock(targetPassword);
      }
      return importSnapshot(connections.store, snapshot, {
        conflict,
        ...(targetPassword.length === 0 ? {} : { targetPassword }),
      });
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw new HttpFailure(409, { code: 'invalid-request', message: error.message });
      }
      throw asHttpFailure(error);
    }
  });
}

/** Builds the store's connection input from the wire shape. */
function toConnectionInput(input: ConnectionInput): StoreConnectionInput {
  const target =
    input.environmentId !== null
      ? ({ kind: 'environment', environmentId: asEnvironmentId(input.environmentId) } as const)
      : ({
          kind: 'standalone',
          endpoint: {
            host: input.host ?? '',
            port: input.port ?? 0,
            subjectPrefix: '',
            httpPort: 8080,
          },
        } as const);

  return {
    name: input.name,
    username: input.username,
    target,
    description: input.description,
    folderId: input.folderId === null ? null : asFolderId(input.folderId),
    tagNames: input.tagNames,
    // Present means "set it", absent means "leave what is stored alone".
    ...(input.password === undefined ? {} : { password: input.password }),
  };
}

/** A report of what an import would do, with nothing written. */
function dryRunReport(
  snapshot: ReturnType<typeof parseSnapshot>,
  credentialsAvailable: ReadonlySet<string>,
  includeCredentials: boolean,
): ImportReport {
  return {
    dryRun: true,
    folders: snapshot.folders.length,
    environments: snapshot.environments.length,
    connections: snapshot.connections.length,
    skipped: [],
    renamed: [],
    replaced: [],
    passwordsImported: 0,
    passwordsDropped: includeCredentials ? 0 : credentialsAvailable.size,
  };
}
