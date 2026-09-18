import {
  ConnectionsStoreError,
  NotFoundError,
  StoreLockedError,
  WrongMasterPasswordError,
  openConnectionsStore,
  type ConnectionsStore,
} from '@volga/connections';
import type {
  ConnectionView,
  ConnectionsCatalog,
  EnvironmentView,
  FolderView,
  TagView,
} from '@volga/contracts';
import { HttpFailure } from './errors.js';

/**
 * The connections store as the BFF uses it.
 *
 * One store per process, opened at startup, because the database is a single
 * user's and this process serves that user. The master password lives on the
 * store instance for as long as the process runs, which mirrors the desktop
 * client holding it in memory, and is what lets the sign-in screen show saved
 * credentials without prompting again.
 *
 * Reads never need the master password. Environments, names and usernames are
 * not secret, and the sign-in screen has to show somewhere to connect before
 * anyone has identified themselves. Only saved passwords are encrypted, and
 * only writes and credential use need the store unlocked.
 */

export class ConnectionsService {
  readonly #store: ConnectionsStore;

  constructor(store: ConnectionsStore) {
    this.#store = store;
  }

  get store(): ConnectionsStore {
    return this.#store;
  }

  get path(): string {
    return this.#store.path;
  }

  close(): void {
    this.#store.close();
  }

  /** Everything the pre-authentication screens need, in one read. */
  catalog(): ConnectionsCatalog {
    const state = this.#store.state();
    return {
      store: {
        databasePath: this.#store.location.databasePath,
        directory: this.#store.location.directory,
        source: this.#store.location.source,
        uninitialised: state.uninitialised,
        unlocked: state.unlocked,
        hasSavedPasswords: state.hasSavedPasswords,
      },
      environments: [...this.environments()],
      connections: [...this.connections()],
      folders: [...this.folders()],
      tags: [...this.tags()],
    };
  }

  /** Unlocks, or initialises a store that has no master password yet. */
  unlock(masterPassword: string): { readonly initialised: boolean } {
    const wasUninitialised = this.#store.state().uninitialised;
    try {
      this.#store.unlock(masterPassword);
    } catch (cause) {
      throw asHttpFailure(cause);
    }
    return { initialised: wasUninitialised };
  }

  environments(): readonly EnvironmentView[] {
    return this.#store.environmentSummaries().map((environment) => ({
      id: environment.id,
      name: environment.name,
      description: environment.description,
      endpoint: environment.endpoint,
      folderId: environment.folderId,
      tagNames: [...environment.tagNames],
      updatedAt:
        this.#store.getEnvironment(environment.id)?.updatedAt ?? new Date(0).toISOString(),
    }));
  }

  connections(): readonly ConnectionView[] {
    return this.#store.connectionSummaries().map((summary) => {
      const stored = this.#store.getConnection(summary.id);
      return {
        id: summary.id,
        name: summary.name,
        username: summary.username,
        description: summary.description,
        folderId: summary.folderId,
        tagNames: [...summary.tagNames],
        // Whether a credential exists is said; the credential itself never is.
        hasSavedPassword: stored?.encryptedPassword !== null && stored?.encryptedPassword !== undefined,
        environment:
          summary.environment.kind === 'environment'
            ? {
                kind: 'environment' as const,
                id: summary.environment.id,
                name: summary.environment.name,
              }
            : { kind: 'standalone' as const, endpoint: summary.environment.endpoint },
      };
    });
  }

  folders(): readonly FolderView[] {
    return this.#store.listFolders().map((folder) => ({
      id: folder.id,
      parentId: folder.parentId,
      name: folder.name,
      description: folder.description,
    }));
  }

  tags(): readonly TagView[] {
    return this.#store.listTags().map((tag) => ({ id: tag.id, name: tag.name }));
  }
}

/**
 * Translates a store failure into a status the browser branches on.
 *
 * The mapping is here rather than in the generic handler so a store error
 * cannot accidentally surface as a 500, and so a new store error type is a
 * compile error at this switch rather than a silent regression.
 */
export function asHttpFailure(error: unknown): HttpFailure {
  if (error instanceof HttpFailure) {
    return error;
  }
  if (error instanceof WrongMasterPasswordError) {
    return new HttpFailure(401, { code: 'invalid-credentials', message: error.message });
  }
  if (error instanceof StoreLockedError) {
    return new HttpFailure(403, {
      code: 'forbidden',
      message: 'Unlock the connections store before making changes.',
    });
  }
  if (error instanceof NotFoundError) {
    return new HttpFailure(404, { code: 'invalid-request', message: error.message });
  }
  if (error instanceof ConnectionsStoreError) {
    return new HttpFailure(409, { code: 'invalid-request', message: error.message });
  }
  // A constraint the schema enforces, such as a duplicate name, is the
  // person's mistake to correct rather than a server fault.
  const message = error instanceof Error ? error.message : '';
  if (message.includes('UNIQUE constraint failed')) {
    return new HttpFailure(409, {
      code: 'invalid-request',
      message: 'Something with that name already exists.',
    });
  }
  if (message.includes('CHECK constraint failed')) {
    return new HttpFailure(409, {
      code: 'invalid-request',
      message: 'That record breaks a rule of the connections store.',
    });
  }
  return new HttpFailure(500, { code: 'internal', message: 'Something went wrong.' });
}

/** Opens the store for this process, applying any auto-unlock password. */
export function openConnectionsService(environment: NodeJS.ProcessEnv = process.env): ConnectionsService {
  const service = new ConnectionsService(openConnectionsStore({ environment }));

  // Mirrors the Qt client's auto-unlock: a password in the environment removes
  // the unlock step for a development or single-user machine.
  const configured = environment['VOLGA_CONNECTIONS_MASTER_PASSWORD'];
  if (configured !== undefined && configured.trim().length > 0) {
    try {
      service.unlock(configured);
    } catch {
      // A wrong auto-unlock password is not fatal: the UI still offers the
      // unlock step, and failing to start would be worse than prompting.
      process.emitWarning(
        'VOLGA_CONNECTIONS_MASTER_PASSWORD did not open the connections store; ' +
          'the store will prompt for it instead.',
      );
    }
  }

  return service;
}
