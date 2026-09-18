import { DatabaseSync } from 'node:sqlite';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readInteger, readNullableString, readString, type Row } from './rows.js';
import type {
  ConnectionTarget,
  Endpoint,
  Environment,
  Folder,
  FolderId,
  Tag,
  ConnectionsSnapshot,
} from './types.js';

/**
 * Reading the legacy Qt client's connections store.
 *
 * This exists to move a person's existing connections across once. It is
 * read-only and separate from the store, so nothing in the running application
 * depends on a schema that is being retired. Once a store has been migrated
 * there is no reason to call any of this again.
 *
 * The two stores differ in more than table names, so the differences are
 * resolved here rather than in the store:
 *
 * - The legacy schema lets a connection carry both an environment reference and
 *   its own host, which the new schema forbids. The environment wins, because
 *   that is what the client resolved at connect time.
 * - The legacy encryption is PBKDF2-SHA256 with AES-256-GCM in its own packed
 *   layout. Passwords are decrypted here and re-encrypted by the store, so they
 *   end up under the new master password in the new format.
 * - The legacy store has no HTTP port, so the default is used.
 */

/** The legacy store's crypto parameters, from its `encryption.cpp`. */
const LEGACY_PBKDF2_ITERATIONS = 600_000;
const LEGACY_SALT_BYTES = 16;
const LEGACY_IV_BYTES = 12;
const LEGACY_TAG_BYTES = 16;
const LEGACY_KEY_BYTES = 32;
const DEFAULT_HTTP_PORT = 8080;

export class LegacyStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LegacyStoreError';
  }
}

/** A legacy store's contents, with passwords already decrypted. */
export interface LegacyConnection {
  readonly name: string;
  readonly username: string;
  /** Decrypted, and therefore needing re-encryption before it is stored. */
  readonly password: string | null;
  readonly description: string;
  readonly folderId: FolderId | null;
  readonly tagNames: readonly string[];
  readonly target: ConnectionTarget;
}

export interface LegacyStore {
  readonly folders: readonly Folder[];
  readonly environments: readonly Environment[];
  readonly tags: readonly Tag[];
  readonly connections: readonly LegacyConnection[];
  /** Connections that could not be placed, named so they are not lost silently. */
  readonly dangling: readonly string[];
}

/** Decrypts one legacy password. */
export function decryptLegacySecret(blob: string, masterPassword: string): string {
  if (blob.length === 0) {
    return '';
  }
  const raw = Buffer.from(blob, 'base64');
  const minimum = LEGACY_SALT_BYTES + LEGACY_IV_BYTES + LEGACY_TAG_BYTES;
  if (raw.length < minimum) {
    throw new LegacyStoreError('The stored password is truncated');
  }

  const salt = raw.subarray(0, LEGACY_SALT_BYTES);
  const iv = raw.subarray(LEGACY_SALT_BYTES, LEGACY_SALT_BYTES + LEGACY_IV_BYTES);
  const tag = raw.subarray(LEGACY_SALT_BYTES + LEGACY_IV_BYTES, minimum);
  const ciphertext = raw.subarray(minimum);

  try {
    const key = pbkdf2Sync(
      masterPassword,
      salt,
      LEGACY_PBKDF2_ITERATIONS,
      LEGACY_KEY_BYTES,
      'sha256',
    );
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (cause) {
    throw new LegacyStoreError('The master password is incorrect', { cause });
  }
}

/**
 * Reads a legacy store.
 *
 * @param path The legacy `connections.db`.
 * @param masterPassword Its master password.
 * @throws {LegacyStoreError} when the file is not a legacy store, or the
 * password does not open it.
 */
export function readLegacyStore(path: string, masterPassword: string): LegacyStore {
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(path, { readOnly: true });
  } catch (cause) {
    throw new LegacyStoreError(`Cannot open ${path}`, { cause });
  }

  try {
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => readString(row, 'name')),
    );
    const missing = ['folders', 'environments', 'connections', 'tags'].filter(
      (table) => !tables.has(table),
    );
    if (missing.length > 0) {
      throw new LegacyStoreError(
        `That file is not a connections store: it has no ${missing.join(', ')}`,
      );
    }

    const tagsByOwner = readLegacyTags(database);

    const folders: Folder[] = database
      .prepare('SELECT id, parent_id, name, description FROM folders')
      .all()
      .map((row) => ({
        // The legacy store uses its own identifiers, which the store mints
        // afresh, so these are carried as a mapping key only.
        id: legacyKey(readString(row, 'id')),
        parentId: nullableKey(readNullableString(row, 'parent_id')),
        name: readString(row, 'name'),
        description: readNullableString(row, 'description') ?? '',
      }));

    const environments: Environment[] = database
      .prepare(
        'SELECT id, folder_id, name, host, port, subject_prefix, description FROM environments',
      )
      .all()
      .map((row) => {
        const id = readString(row, 'id');
        return {
          id: legacyKey(id),
          folderId: nullableKey(readNullableString(row, 'folder_id')),
          name: readString(row, 'name'),
          endpoint: {
            host: readString(row, 'host'),
            port: readInteger(row, 'port'),
            subjectPrefix: readNullableString(row, 'subject_prefix') ?? '',
            httpPort: DEFAULT_HTTP_PORT,
          },
          description: readNullableString(row, 'description') ?? '',
          tags: tagsByOwner.environment.get(id) ?? [],
          updatedAt: new Date().toISOString(),
        };
      });

    const knownEnvironments = new Map(
      environments.map((environment) => [environment.id, environment] as const),
    );

    const dangling: string[] = [];
    const connections: LegacyConnection[] = [];

    for (const row of database
      .prepare(
        `SELECT id, folder_id, environment_id, name, host, port, username,
                encrypted_password, description
           FROM connections`,
      )
      .all() as readonly Row[]) {
      const id = readString(row, 'id');
      const name = readString(row, 'name');
      const environmentKey = readNullableString(row, 'environment_id');
      const host = readNullableString(row, 'host');
      const port = row['port'] === null ? null : readInteger(row, 'port');
      const encrypted = readNullableString(row, 'encrypted_password');

      // The environment wins when both are present, which matches what the
      // legacy client resolved. The endpoint is then taken from the
      // environment so the new store's rule, one or the other, is satisfied.
      let target: ConnectionTarget | undefined;
      if (environmentKey !== null) {
        const key = legacyKey(environmentKey);
        const environment = knownEnvironments.get(key);
        if (environment === undefined) {
          dangling.push(name);
          continue;
        }
        target = { kind: 'environment', environmentId: environment.id };
      } else if (host !== null && port !== null) {
        target = {
          kind: 'standalone',
          endpoint: { host, port, subjectPrefix: '', httpPort: DEFAULT_HTTP_PORT },
        };
      }

      if (target === undefined) {
        // Neither an environment nor an endpoint: there is nowhere to connect.
        dangling.push(name);
        continue;
      }

      connections.push({
        name,
        username: readString(row, 'username'),
        password:
          encrypted === null || encrypted.length === 0
            ? null
            : decryptLegacySecret(encrypted, masterPassword),
        description: readNullableString(row, 'description') ?? '',
        folderId: nullableKey(readNullableString(row, 'folder_id')),
        tagNames: tagsByOwner.connection.get(id) ?? [],
        target,
      });
    }

    const tagNames = new Set<string>();
    for (const names of tagsByOwner.environment.values()) {
      for (const name of names) {
        tagNames.add(name);
      }
    }
    for (const names of tagsByOwner.connection.values()) {
      for (const name of names) {
        tagNames.add(name);
      }
    }
    const tags: Tag[] = [...tagNames]
      .sort()
      .map((name) => ({ id: legacyKey(`tag:${name}`), name }));

    return { folders, environments, tags, connections, dangling };
  } finally {
    database.close();
  }
}

/** Reports whether a password opens a legacy store, without reading it all. */
export function verifyLegacyPassword(
  path: string,
  masterPassword: string,
): { readonly ok: boolean; readonly reason: string } {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const row = database
      .prepare("SELECT encrypted_password FROM connections WHERE encrypted_password <> '' LIMIT 1")
      .get();
    if (row === undefined) {
      return { ok: true, reason: 'the store has no saved passwords' };
    }
    try {
      decryptLegacySecret(readString(row, 'encrypted_password'), masterPassword);
      return { ok: true, reason: 'the password opens the store' };
    } catch {
      return { ok: false, reason: 'that master password does not open the file' };
    }
  } finally {
    database.close();
  }
}

function readLegacyTags(database: DatabaseSync): {
  readonly environment: Map<string, string[]>;
  readonly connection: Map<string, string[]>;
} {
  const names = new Map<string, string>();
  for (const row of database.prepare('SELECT id, name FROM tags').all()) {
    names.set(readString(row, 'id'), readString(row, 'name'));
  }

  function collect(table: string, column: string): Map<string, string[]> {
    const collected = new Map<string, string[]>();
    for (const row of database.prepare(`SELECT ${column} AS owner, tag_id FROM ${table}`).all()) {
      const owner = readString(row, 'owner');
      const name = names.get(readString(row, 'tag_id'));
      if (name === undefined) {
        continue;
      }
      collected.set(owner, [...(collected.get(owner) ?? []), name]);
    }
    return collected;
  }

  return {
    environment: collect('environment_tags', 'environment_id'),
    connection: collect('connection_tags', 'connection_id'),
  };
}

/** The legacy ids are carried as plain strings, not as this store's ids. */
function legacyKey(value: string): string {
  return value;
}

function nullableKey(value: string | null): string | null {
  return value;
}

/** A snapshot built from a legacy store, ready to be imported. */
export function legacyToSnapshot(
  legacy: LegacyStore,
): { readonly snapshot: ConnectionsSnapshot; readonly passwords: ReadonlyMap<string, string> } {
  // Folders are ordered parent first. The import writes a child with a
  // reference to its parent, and the parent has to exist by then.
  const folders = [...legacy.folders].sort(
    (left, right) => depthOf(left, legacy.folders) - depthOf(right, legacy.folders),
  );

  const connections: ConnectionsSnapshot['connections'] = legacy.connections.map(
    (connection, index) => ({
      id: `legacy-connection-${index}`,
      // The folder assignments are carried across, keyed by the legacy folder
      // ids, which the folder entries below also use. The import maps one set
      // of keys onto the ids the store mints, so the two have to agree.
      folderId: connection.folderId,
      name: connection.name,
      target: connection.target,
      username: connection.username,
      // Passwords travel beside the snapshot and are re-encrypted on import, so
      // the snapshot itself never holds one in the clear.
      encryptedPassword: null,
      description: connection.description,
      tags: [...connection.tagNames],
      updatedAt: new Date().toISOString(),
    }),
  );

  const passwords = new Map<string, string>();
  legacy.connections.forEach((connection, index) => {
    if (connection.password !== null && connection.password.length > 0) {
      passwords.set(`legacy-connection-${index}`, connection.password);
    }
  });

  return {
    snapshot: {
      environments: [...legacy.environments],
      connections,
      folders,
      tags: legacy.tags,
    },
    passwords,
  };
}

/**
 * How deep a folder sits, so a parent is always written before its child.
 *
 * A cycle, which only a corrupted file could contain, is treated as depth zero
 * rather than recursing forever.
 */
function depthOf(folder: Folder, all: readonly Folder[]): number {
  const byId = new Map(all.map((item) => [item.id, item] as const));
  let depth = 0;
  let current: Folder | undefined = folder;
  const seen = new Set<string>();
  while (current?.parentId != null) {
    if (seen.has(current.id)) {
      return 0;
    }
    seen.add(current.id);
    current = byId.get(current.parentId);
    depth += 1;
  }
  return depth;
}

export type { Endpoint };
