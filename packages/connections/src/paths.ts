import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Where the connections store lives.
 *
 * The store belongs to the person, not to the application or the repository,
 * because it holds the places they connect to and the credentials for them.
 * It has to be readable before anyone has signed in, which rules out anything
 * held in a session, and it has to be a real file the user can find, copy to
 * another machine, or put in a backup.
 *
 * The location follows the XDG Base Directory specification, which is the
 * desktop convention for exactly this kind of per-user configuration. That
 * makes the answer to "where is it" a documented path rather than a browser
 * private store.
 */

/** Overrides the directory. Useful for tests and for a portable install. */
export const DATA_DIR_ENVIRONMENT_VARIABLE = 'VOLGA_DATA_DIR';

const APPLICATION_DIRECTORY = 'volga';
const DATABASE_FILENAME = 'connections.db';

/** The directory holding every file Volga keeps for this user. */
export function defaultDataDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  const override = environment[DATA_DIR_ENVIRONMENT_VARIABLE];
  if (override !== undefined && override.trim().length > 0) {
    return resolve(override);
  }

  // XDG_CONFIG_HOME is the standard base for configuration. It is preferred
  // over XDG_DATA_HOME because this store is configuration rather than
  // application output, and it is the directory a person already backs up.
  const configHome = environment['XDG_CONFIG_HOME'];
  const base =
    configHome !== undefined && configHome.trim().length > 0
      ? configHome
      : join(homedir(), '.config');

  return join(base, APPLICATION_DIRECTORY);
}

/** The connections database file. */
export function databasePath(environment: NodeJS.ProcessEnv = process.env): string {
  const explicit = environment['VOLGA_CONNECTIONS_DB'];
  if (explicit !== undefined && explicit.trim().length > 0) {
    return resolve(explicit);
  }
  return join(defaultDataDirectory(environment), DATABASE_FILENAME);
}

/** Everything a person needs to find, back up, or move the store. */
export interface StoreLocation {
  readonly directory: string;
  readonly databasePath: string;
  /** True when the database file already exists. */
  readonly exists: boolean;
  /**
   * What determined the path, so a surprising location can be explained rather
   * than guessed at.
   */
  readonly source:
    | 'explicit'
    | typeof DATA_DIR_ENVIRONMENT_VARIABLE
    | 'VOLGA_CONNECTIONS_DB'
    | 'XDG_CONFIG_HOME'
    | 'default';
}

/**
 * Resolves where the store is, and why it is there.
 *
 * Pass @p explicit when the caller already chose a file, so the reported
 * location describes the file actually in use rather than what the environment
 * would have chosen.
 */
export function resolveStoreLocation(
  environment: NodeJS.ProcessEnv = process.env,
  explicit?: string,
): StoreLocation {
  const path = explicit ?? databasePath(environment);
  const directory = resolve(path, '..');

  const source: StoreLocation['source'] =
    explicit !== undefined
      ? 'explicit'
      : environment['VOLGA_CONNECTIONS_DB'] !== undefined &&
          environment['VOLGA_CONNECTIONS_DB'].trim().length > 0
        ? 'VOLGA_CONNECTIONS_DB'
        : environment[DATA_DIR_ENVIRONMENT_VARIABLE] !== undefined &&
            environment[DATA_DIR_ENVIRONMENT_VARIABLE].trim().length > 0
          ? DATA_DIR_ENVIRONMENT_VARIABLE
          : environment['XDG_CONFIG_HOME'] !== undefined &&
              environment['XDG_CONFIG_HOME'].trim().length > 0
            ? 'XDG_CONFIG_HOME'
            : 'default';

  return { directory, databasePath: resolve(path), exists: existsSync(path), source };
}
