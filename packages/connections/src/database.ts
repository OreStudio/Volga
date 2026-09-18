import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { databasePath as defaultDatabasePath } from './paths.js';
import { migrate, SchemaTooNewError } from './schema.js';

/**
 * Opening the store.
 *
 * The database is opened writable, because the store is expected to be edited:
 * adding an environment is the first thing a new install does. The file and its
 * directory are created on first use, so a person never has to run an
 * initialisation step to get started.
 */

export interface OpenOptions {
  readonly path?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface OpenedStore {
  readonly database: DatabaseSync;
  readonly path: string;
  /** True when the file did not exist and was created by this call. */
  readonly created: boolean;
}

/**
 * Pragmas every connection wants.
 *
 * Referential integrity is off by default in SQLite, and the schema relies on
 * it to keep a connection's endpoint rule honest. Write-ahead logging lets the
 * sign-in screen read while the application writes.
 */
function applyPragmas(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA synchronous = NORMAL');
  database.exec('PRAGMA busy_timeout = 5000');
}

/**
 * Opens the store, creating it if needed and bringing it up to date.
 *
 * @throws {SchemaTooNewError} when the file was written by a newer build.
 */
export function openStore(options: OpenOptions = {}): OpenedStore {
  const path = options.path ?? defaultDatabasePath(options.environment ?? process.env);
  const existed = existsSync(path);

  if (!existed) {
    // 0700 on the directory: the store holds encrypted passwords and the
    // verifier, so it is nobody else's business even before the file mode.
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }

  const database = new DatabaseSync(path);
  try {
    applyPragmas(database);
    migrate(database);
  } catch (cause) {
    database.close();
    throw cause;
  }

  return { database, path, created: !existed };
}

export { SchemaTooNewError };
