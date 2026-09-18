import type { DatabaseSync } from 'node:sqlite';

/**
 * The store's schema, applied as ordered migrations.
 *
 * Migrations rather than a single `CREATE TABLE IF NOT EXISTS` script, because
 * the store lives on a person's machine and will outlive any one version of
 * the application. `PRAGMA user_version` records how far it has been brought
 * forward, so an older file is upgraded in place and a newer file is refused
 * rather than silently misread.
 */

export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly statements: readonly string[];
}

/** The version a freshly created store is written at. */
export const SCHEMA_VERSION = 1;

/**
 * Two design choices differ from the Qt client's schema on purpose.
 *
 * The endpoint rule is enforced by the database. A connection either points at
 * an environment or states its own host and port, and the CHECK constraint
 * makes a half-populated row impossible rather than merely discouraged.
 *
 * There is no junction table per taggable kind. Tags attach through one table
 * keyed by (owner_kind, owner_id), so a new taggable thing costs no migration.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'environments, connections, folders, tags and the master-password verifier',
    statements: [
      `CREATE TABLE store_meta (
         key   TEXT PRIMARY KEY,
         value TEXT NOT NULL
       ) STRICT`,

      `CREATE TABLE folders (
         id          TEXT PRIMARY KEY,
         parent_id   TEXT REFERENCES folders(id) ON DELETE RESTRICT,
         name        TEXT NOT NULL COLLATE NOCASE,
         description TEXT NOT NULL DEFAULT '',
         created_at  TEXT NOT NULL,
         updated_at  TEXT NOT NULL
       ) STRICT`,

      `CREATE UNIQUE INDEX folders_unique_name
         ON folders (COALESCE(parent_id, ''), name)`,

      `CREATE TABLE environments (
         id             TEXT PRIMARY KEY,
         folder_id      TEXT REFERENCES folders(id) ON DELETE SET NULL,
         name           TEXT NOT NULL COLLATE NOCASE,
         host           TEXT NOT NULL,
         port           INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
         http_port      INTEGER NOT NULL CHECK (http_port BETWEEN 1 AND 65535),
         subject_prefix TEXT NOT NULL DEFAULT '',
         description    TEXT NOT NULL DEFAULT '',
         created_at     TEXT NOT NULL,
         updated_at     TEXT NOT NULL
       ) STRICT`,

      `CREATE UNIQUE INDEX environments_unique_name ON environments (name)`,
      `CREATE INDEX environments_folder ON environments (folder_id)`,

      `CREATE TABLE connections (
         id                 TEXT PRIMARY KEY,
         folder_id          TEXT REFERENCES folders(id) ON DELETE SET NULL,
         environment_id     TEXT REFERENCES environments(id) ON DELETE SET NULL,
         name               TEXT NOT NULL COLLATE NOCASE,
         host               TEXT,
         port               INTEGER CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
         username           TEXT NOT NULL,
         encrypted_password TEXT NOT NULL DEFAULT '',
         description        TEXT NOT NULL DEFAULT '',
         created_at         TEXT NOT NULL,
         updated_at         TEXT NOT NULL,
         CHECK (
           (environment_id IS NOT NULL AND host IS NULL AND port IS NULL)
           OR
           (environment_id IS NULL AND host IS NOT NULL AND port IS NOT NULL)
         )
       ) STRICT`,

      `CREATE INDEX connections_folder ON connections (folder_id)`,
      `CREATE INDEX connections_environment ON connections (environment_id)`,
      `CREATE UNIQUE INDEX connections_unique_name ON connections (name)`,

      `CREATE TABLE tags (
         id   TEXT PRIMARY KEY,
         name TEXT NOT NULL COLLATE NOCASE
       ) STRICT`,

      `CREATE UNIQUE INDEX tags_unique_name ON tags (name)`,

      `CREATE TABLE taggings (
         owner_kind TEXT NOT NULL CHECK (owner_kind IN ('environment', 'connection')),
         owner_id   TEXT NOT NULL,
         tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
         PRIMARY KEY (owner_kind, owner_id, tag_id)
       ) STRICT`,

      `CREATE INDEX taggings_tag ON taggings (tag_id)`,

      // Parties the person has used before, so the party picker can put the
      // likely choice first without asking the server.
      `CREATE TABLE recent_parties (
         party_id   TEXT PRIMARY KEY,
         party_name TEXT NOT NULL,
         used_at    TEXT NOT NULL
       ) STRICT`,
    ],
  },
];

export class SchemaTooNewError extends Error {
  readonly found: number;
  readonly supported: number;

  constructor(found: number, supported: number) {
    super(
      `The store is at schema version ${found} but this build understands ${supported}. ` +
        'Upgrade Volga, or point VOLGA_DATA_DIR at a different store.',
    );
    this.name = 'SchemaTooNewError';
    this.found = found;
    this.supported = supported;
  }
}

function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}

/**
 * Brings a store up to the current schema.
 *
 * Each migration runs inside a transaction with the version bump, so an
 * interrupted upgrade leaves the file at the last version that completed
 * rather than half-applied.
 *
 * @throws {SchemaTooNewError} when the file was written by a newer build.
 */
export function migrate(database: DatabaseSync): { readonly from: number; readonly to: number } {
  const from = readUserVersion(database);
  if (from > SCHEMA_VERSION) {
    throw new SchemaTooNewError(from, SCHEMA_VERSION);
  }
  if (from === SCHEMA_VERSION) {
    return { from, to: from };
  }

  database.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const migration of MIGRATIONS) {
      if (migration.version <= from) {
        continue;
      }
      database.exec('BEGIN IMMEDIATE');
      try {
        for (const statement of migration.statements) {
          database.exec(statement);
        }
        // PRAGMA does not accept a bound parameter, and the value here is an
        // integer this module owns, never input.
        database.exec(`PRAGMA user_version = ${migration.version}`);
        database.exec('COMMIT');
      } catch (cause) {
        database.exec('ROLLBACK');
        throw new Error(
          `Migration ${migration.version} (${migration.description}) failed`,
          { cause },
        );
      }
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }

  return { from, to: SCHEMA_VERSION };
}
