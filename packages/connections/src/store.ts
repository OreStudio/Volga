import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { readCount, readInteger, readNullableString, readString, type Row } from './rows.js';
import { openStore, type OpenOptions } from './database.js';
import { resolveStoreLocation, type StoreLocation } from './paths.js';
import {
  createVerifier,
  decryptSecret,
  encryptSecret,
  verifyMasterPassword as checkVerifier,
  type EncryptedSecret,
  type Verifier,
} from './crypto.js';
import {
  connectionId,
  environmentId,
  folderId,
  tagId,
  type Connection,
  type ConnectionId,
  type ConnectionSummary,
  type ConnectionTarget,
  type ConnectionsSnapshot,
  type Endpoint,
  type Environment,
  type EnvironmentId,
  type EnvironmentSummary,
  type Folder,
  type FolderId,
  type Tag,
  type TagId,
} from './types.js';

/**
 * The connections store.
 *
 * Everything the sign-in screen needs is readable without a master password:
 * people choose where to connect before they have identified themselves, so
 * environment names, hosts and usernames are open. Only saved passwords are
 * encrypted, and only they need unlocking.
 *
 * The master password is held in memory on this instance for as long as the
 * caller keeps it, which mirrors the desktop client's behaviour and means a
 * failed sign-in does not force the person to type it again.
 */

export class ConnectionsStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConnectionsStoreError';
  }
}

export class StoreLockedError extends ConnectionsStoreError {
  constructor() {
    super('The store is locked. Call unlock() with the master password first.');
    this.name = 'StoreLockedError';
  }
}

export class WrongMasterPasswordError extends ConnectionsStoreError {
  constructor() {
    super('That master password does not open this store.');
    this.name = 'WrongMasterPasswordError';
  }
}

export class NotFoundError extends ConnectionsStoreError {
  constructor(kind: string, id: string) {
    super(`No ${kind} with id ${id}`);
    this.name = 'NotFoundError';
  }
}

export interface EnvironmentInput {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly httpPort?: number;
  readonly subjectPrefix?: string;
  readonly description?: string;
  readonly folderId?: FolderId | null;
  readonly tagNames?: readonly string[];
}

export interface ConnectionInput {
  readonly name: string;
  readonly target: ConnectionTarget;
  readonly username: string;
  /**
   * The password to save, in the clear.
   *
   * This is the only moment the plaintext exists outside the person's screen,
   * so it is encrypted immediately and never returned by a read.
   */
  readonly password?: string;
  readonly description?: string;
  readonly folderId?: FolderId | null;
  readonly tagNames?: readonly string[];
}

export interface UnlockState {
  /** True when a master password has been supplied and checks out. */
  readonly unlocked: boolean;
  /** True when the store holds at least one saved password. */
  readonly hasSavedPasswords: boolean;
  /** True when no master password has ever been set. */
  readonly uninitialised: boolean;
}

export interface ConnectionsStore {
  readonly path: string;
  /**
   * Where the store is and why it is there.
   *
   * The interface shows this, because the store belongs to the person using it
   * and they need to find it to back it up or carry it to another machine.
   */
  readonly location: StoreLocation;
  /** Whether the file was created by this open. */
  readonly created: boolean;

  state(): UnlockState;
  /**
   * Sets the master password, creating the verifier on a fresh store.
   *
   * @throws {WrongMasterPasswordError} when the store already has a verifier
   * and the password does not match it.
   */
  unlock(masterPassword: string): UnlockState;
  /** Forgets the master password. Saved passwords become unusable until unlock. */
  lock(): void;
  /** Changes the master password, re-encrypting every saved password. */
  changeMasterPassword(currentPassword: string, newPassword: string): void;

  listEnvironments(): readonly Environment[];
  getEnvironment(id: EnvironmentId): Environment | undefined;
  saveEnvironment(input: EnvironmentInput, id?: EnvironmentId): Environment;
  deleteEnvironment(id: EnvironmentId): void;
  /** Environments prepared for the sign-in screen. */
  environmentSummaries(): readonly EnvironmentSummary[];

  listConnections(): readonly Connection[];
  getConnection(id: ConnectionId): Connection | undefined;
  saveConnection(input: ConnectionInput, id?: ConnectionId): Connection;
  deleteConnection(id: ConnectionId): void;
  /**
   * Connections prepared for the sign-in screen.
   *
   * Names, usernames and endpoints, never a password.
   */
  connectionSummaries(): readonly ConnectionSummary[];
  /**
   * Resolves the password to sign in with.
   *
   * Prefers the caller's own entry, so someone can override what is stored
   * without editing the store, and falls back to the saved password, which
   * requires an unlocked store.
   *
   * @throws {StoreLockedError} when a saved password is needed but the store
   * is locked.
   */
  resolvePassword(id: ConnectionId, supplied?: string): string;

  listFolders(): readonly Folder[];
  saveFolder(input: { readonly name: string; readonly description?: string; readonly parentId?: FolderId | null }, id?: FolderId): Folder;
  deleteFolder(id: FolderId): void;

  listTags(): readonly Tag[];
  ensureTag(name: string): Tag;

  snapshot(): ConnectionsSnapshot;
  /**
   * Flushes the write-ahead log into the main database file.
   *
   * Called before the file is copied, so a single-file copy is complete and the
   * `-wal` and `-shm` companions are not needed alongside it.
   */
  checkpoint(): void;
  close(): void;
}


export function openConnectionsStore(options: OpenOptions = {}): ConnectionsStore {
  const opened = openStore(options);
  // The location describes the file actually opened, so a caller-supplied path
  // is reported as itself rather than as whatever the environment would pick.
  const location = resolveStoreLocation(options.environment ?? process.env, options.path);
  return createStore(opened.database, opened.path, opened.created, location);
}

function now(): string {
  return new Date().toISOString();
}

/** Validates a port once, at the boundary, so nothing downstream has to. */
function assertPort(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConnectionsStoreError(`${label} must be an integer between 1 and 65535, got ${value}`);
  }
  return value;
}

function assertName(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ConnectionsStoreError(`${label} cannot be empty`);
  }
  return trimmed;
}

function createStore(
  database: DatabaseSync,
  path: string,
  created: boolean,
  location: StoreLocation,
): ConnectionsStore {
  let masterPassword: string | undefined;

  function readVerifier(): Verifier | undefined {
    const row = database
      .prepare("SELECT value FROM store_meta WHERE key = 'verifier'")
      .get();
    if (row === undefined) {
      return undefined;
    }
    try {
      return JSON.parse(readString(row, 'value')) as Verifier;
    } catch (cause) {
      throw new ConnectionsStoreError('The stored verifier is unreadable', { cause });
    }
  }

  function writeVerifier(verifier: Verifier): void {
    database
      .prepare("INSERT OR REPLACE INTO store_meta (key, value) VALUES ('verifier', ?)")
      .run(JSON.stringify(verifier));
  }

  function savedPasswordCount(): number {
    const row = database
      .prepare("SELECT COUNT(*) AS count FROM connections WHERE encrypted_password <> ''")
      .get();
    return readCount(row, 'count');
  }

  function requireUnlocked(): string {
    if (masterPassword === undefined) {
      throw new StoreLockedError();
    }
    return masterPassword;
  }

  function state(): UnlockState {
    const verifier = readVerifier();
    return {
      unlocked: masterPassword !== undefined && verifier !== undefined,
      hasSavedPasswords: savedPasswordCount() > 0,
      uninitialised: verifier === undefined,
    };
  }

  function unlock(candidate: string): UnlockState {
    const verifier = readVerifier();
    if (verifier === undefined) {
      // A fresh store: the first password offered becomes the master password.
      writeVerifier(createVerifier(candidate));
      masterPassword = candidate;
      return state();
    }
    if (!checkVerifier(verifier, candidate)) {
      throw new WrongMasterPasswordError();
    }
    masterPassword = candidate;
    return state();
  }

  // ------------------------------------------------------------- folders

  function listFolders(): readonly Folder[] {
    const rows = database
      .prepare('SELECT id, parent_id, name, description FROM folders ORDER BY name')
      .all();
    return rows.map(mapFolder);
  }

  function saveFolder(
    input: { readonly name: string; readonly description?: string; readonly parentId?: FolderId | null },
    id?: FolderId,
  ): Folder {
    const name = assertName(input.name, 'Folder name');
    const timestamp = now();
    const folderIdValue = id ?? folderId(randomUUID());

    if (id === undefined) {
      database
        .prepare(
          `INSERT INTO folders (id, parent_id, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(folderIdValue, input.parentId ?? null, name, input.description ?? '', timestamp, timestamp);
    } else {
      const changed = database
        .prepare('UPDATE folders SET name = ?, description = ?, parent_id = ?, updated_at = ? WHERE id = ?')
        .run(name, input.description ?? '', input.parentId ?? null, timestamp, folderIdValue);
      if (changed.changes === 0) {
        throw new NotFoundError('folder', folderIdValue);
      }
    }
    return { id: folderIdValue, parentId: input.parentId ?? null, name, description: input.description ?? '' };
  }

  function deleteFolder(id: FolderId): void {
    database.prepare('DELETE FROM folders WHERE id = ?').run(id);
  }

  // ---------------------------------------------------------------- tags

  function listTags(): readonly Tag[] {
    const rows = database.prepare('SELECT id, name FROM tags ORDER BY name').all();
    return rows.map((row) => ({ id: tagId(readString(row, 'id')), name: readString(row, 'name') }));
  }

  function ensureTag(name: string): Tag {
    const trimmed = assertName(name, 'Tag name');
    const existing = database
      .prepare('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE')
      .get(trimmed);
    if (existing !== undefined) {
      return { id: tagId(readString(existing, 'id')), name: readString(existing, 'name') };
    }
    const id = tagId(randomUUID());
    database.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, trimmed);
    return { id, name: trimmed };
  }

  function tagNamesFor(kind: 'environment' | 'connection', owner: string): readonly string[] {
    const rows = database
      .prepare(
        `SELECT t.name AS name
           FROM taggings g JOIN tags t ON t.id = g.tag_id
          WHERE g.owner_kind = ? AND g.owner_id = ?
          ORDER BY t.name`,
      )
      .all(kind, owner);
    return rows.map((row) => readString(row, 'name'));
  }

  function retag(kind: 'environment' | 'connection', owner: string, names: readonly string[]): void {
    database.prepare('DELETE FROM taggings WHERE owner_kind = ? AND owner_id = ?').run(kind, owner);
    const insert = database.prepare('INSERT OR IGNORE INTO taggings (owner_kind, owner_id, tag_id) VALUES (?, ?, ?)');
    for (const name of names) {
      insert.run(kind, owner, ensureTag(name).id);
    }
  }

  // -------------------------------------------------------- environments

  function listEnvironments(): readonly Environment[] {
    const rows = database
      .prepare(
        `SELECT id, folder_id, name, host, port, http_port, subject_prefix, description, updated_at
           FROM environments ORDER BY name`,
      )
      .all();
    return rows.map((row) => mapEnvironment(row, tagNamesFor('environment', readString(row, 'id'))));
  }

  function getEnvironment(id: EnvironmentId): Environment | undefined {
    const row = database
      .prepare(
        `SELECT id, folder_id, name, host, port, http_port, subject_prefix, description, updated_at
           FROM environments WHERE id = ?`,
      )
      .get(id);
    return row === undefined
      ? undefined
      : mapEnvironment(row, tagNamesFor('environment', readString(row, 'id')));
  }

  function saveEnvironment(input: EnvironmentInput, id?: EnvironmentId): Environment {
    const name = assertName(input.name, 'Environment name');
    const host = assertName(input.host, 'Host');
    const port = assertPort(input.port, 'Port');
    const httpPort = assertPort(input.httpPort ?? 8080, 'HTTP port');
    const timestamp = now();
    const value = id ?? environmentId(randomUUID());

    if (id === undefined) {
      database
        .prepare(
          `INSERT INTO environments
             (id, folder_id, name, host, port, http_port, subject_prefix, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value, input.folderId ?? null, name, host, port, httpPort,
          input.subjectPrefix ?? '', input.description ?? '', timestamp, timestamp,
        );
    } else {
      const changed = database
        .prepare(
          `UPDATE environments
              SET folder_id = ?, name = ?, host = ?, port = ?, http_port = ?,
                  subject_prefix = ?, description = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          input.folderId ?? null, name, host, port, httpPort,
          input.subjectPrefix ?? '', input.description ?? '', timestamp, value,
        );
      if (changed.changes === 0) {
        throw new NotFoundError('environment', value);
      }
    }

    retag('environment', value, input.tagNames ?? []);
    const saved = getEnvironment(value);
    if (saved === undefined) {
      throw new ConnectionsStoreError('The environment disappeared immediately after saving');
    }
    return saved;
  }

  function deleteEnvironment(id: EnvironmentId): void {
    database.prepare('DELETE FROM environments WHERE id = ?').run(id);
  }

  function environmentSummaries(): readonly EnvironmentSummary[] {
    return listEnvironments().map((environment) => ({
      id: environment.id,
      name: environment.name,
      description: environment.description,
      endpoint: environment.endpoint,
      folderId: environment.folderId,
      tagNames: tagNamesFor('environment', environment.id),
    }));
  }

  // --------------------------------------------------------- connections

  function listConnections(): readonly Connection[] {
    const rows = database
      .prepare(
        `SELECT id, folder_id, environment_id, name, host, port, username,
                encrypted_password, description, updated_at
           FROM connections ORDER BY name`,
      )
      .all();
    return rows.map((row) => mapConnection(row, tagNamesFor('connection', readString(row, 'id'))));
  }

  function getConnection(id: ConnectionId): Connection | undefined {
    const row = database
      .prepare(
        `SELECT id, folder_id, environment_id, name, host, port, username,
                encrypted_password, description, updated_at
           FROM connections WHERE id = ?`,
      )
      .get(id);
    return row === undefined
      ? undefined
      : mapConnection(row, tagNamesFor('connection', readString(row, 'id')));
  }

  function saveConnection(input: ConnectionInput, id?: ConnectionId): Connection {
    const name = assertName(input.name, 'Connection name');
    const username = assertName(input.username, 'Username');
    const timestamp = now();
    const value = id ?? connectionId(randomUUID());

    // The schema enforces this too. Checking here turns a constraint violation
    // into a message that names the problem.
    let environment: string | null = null;
    let host: string | null = null;
    let port: number | null = null;
    if (input.target.kind === 'environment') {
      if (getEnvironment(input.target.environmentId) === undefined) {
        throw new NotFoundError('environment', input.target.environmentId);
      }
      environment = input.target.environmentId;
    } else {
      host = assertName(input.target.endpoint.host, 'Host');
      port = assertPort(input.target.endpoint.port, 'Port');
    }

    const encrypted =
      input.password === undefined || input.password.length === 0
        ? undefined
        : encryptSecret(input.password, requireUnlocked());

    if (id === undefined) {
      database
        .prepare(
          `INSERT INTO connections
             (id, folder_id, environment_id, name, host, port, username,
              encrypted_password, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value, input.folderId ?? null, environment, name, host, port, username,
          encrypted ?? '', input.description ?? '', timestamp, timestamp,
        );
    } else {
      // A password the caller did not mention keeps its stored value, so
      // editing a connection's description cannot silently drop its password.
      const assignment =
        encrypted === undefined
          ? `folder_id = ?, environment_id = ?, name = ?, host = ?, port = ?,
             username = ?, description = ?, updated_at = ?`
          : `folder_id = ?, environment_id = ?, name = ?, host = ?, port = ?,
             username = ?, encrypted_password = ?, description = ?, updated_at = ?`;
      const parameters: (string | number | null)[] = [
        input.folderId ?? null, environment, name, host, port, username,
      ];
      if (encrypted !== undefined) {
        parameters.push(encrypted);
      }
      parameters.push(input.description ?? '', timestamp, value);

      const changed = database
        .prepare(`UPDATE connections SET ${assignment} WHERE id = ?`)
        .run(...parameters);
      if (changed.changes === 0) {
        throw new NotFoundError('connection', value);
      }
    }

    retag('connection', value, input.tagNames ?? []);
    const saved = getConnection(value);
    if (saved === undefined) {
      throw new ConnectionsStoreError('The connection disappeared immediately after saving');
    }
    return saved;
  }

  function deleteConnection(id: ConnectionId): void {
    database.prepare('DELETE FROM connections WHERE id = ?').run(id);
  }

  function connectionSummaries(): readonly ConnectionSummary[] {
    const environments = new Map(
      listEnvironments().map((environment) => [environment.id, environment] as const),
    );
    return listConnections().map((connection) => {
      const base = {
        id: connection.id,
        name: connection.name,
        username: connection.username,
        description: connection.description,
        folderId: connection.folderId,
        tagNames: tagNamesFor('connection', connection.id),
      };
      if (connection.target.kind === 'environment') {
        const environment = environments.get(connection.target.environmentId);
        return {
          ...base,
          environment: {
            kind: 'environment' as const,
            id: connection.target.environmentId,
            name: environment?.name ?? '(missing environment)',
          },
        };
      }
      return {
        ...base,
        environment: { kind: 'standalone' as const, endpoint: connection.target.endpoint },
      };
    });
  }

  function resolvePassword(id: ConnectionId, supplied?: string): string {
    // An explicit entry wins, so someone can sign in to a saved connection with
    // a different password without editing the store.
    if (supplied !== undefined && supplied.length > 0) {
      return supplied;
    }
    const connection = getConnection(id);
    if (connection === undefined) {
      throw new NotFoundError('connection', id);
    }
    if (connection.encryptedPassword === null) {
      throw new ConnectionsStoreError(
        `No password is saved for ${connection.name} and none was supplied`,
      );
    }
    return decryptSecret(connection.encryptedPassword as EncryptedSecret, requireUnlocked());
  }

  // ------------------------------------------------------------- lifecycle

  function changeMasterPassword(currentPassword: string, newPassword: string): void {
    const verifier = readVerifier();
    if (verifier === undefined) {
      throw new ConnectionsStoreError('The store has no master password to change');
    }
    if (!checkVerifier(verifier, currentPassword)) {
      throw new WrongMasterPasswordError();
    }

    const rows = database
      .prepare("SELECT id, encrypted_password FROM connections WHERE encrypted_password <> ''")
      .all();

    // Everything happens in one transaction: a failure part-way would leave
    // some passwords under the old key and some under the new one.
    database.exec('BEGIN IMMEDIATE');
    try {
      const update = database.prepare('UPDATE connections SET encrypted_password = ? WHERE id = ?');
      for (const row of rows) {
        const blob = readString(row, 'encrypted_password') as EncryptedSecret;
        const plaintext = decryptSecret(blob, currentPassword);
        update.run(encryptSecret(plaintext, newPassword), readString(row, 'id'));
      }
      writeVerifier(createVerifier(newPassword));
      database.exec('COMMIT');
    } catch (cause) {
      database.exec('ROLLBACK');
      throw new ConnectionsStoreError('Could not change the master password', { cause });
    }

    masterPassword = newPassword;
  }

  function snapshot(): ConnectionsSnapshot {
    return {
      environments: listEnvironments(),
      connections: listConnections(),
      folders: listFolders(),
      tags: listTags(),
    };
  }

  return {
    path,
    location,
    created,
    state,
    unlock,
    lock: () => {
      masterPassword = undefined;
    },
    changeMasterPassword,
    listEnvironments,
    getEnvironment,
    saveEnvironment,
    deleteEnvironment,
    environmentSummaries,
    listConnections,
    getConnection,
    saveConnection,
    deleteConnection,
    connectionSummaries,
    resolvePassword,
    listFolders,
    saveFolder,
    deleteFolder,
    listTags,
    ensureTag,
    snapshot,
    checkpoint: () => {
      database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    },
    close: () => database.close(),
  };
}

// ------------------------------------------------------------- row mapping





function mapFolder(row: Row): Folder {
  const parent = readNullableString(row, 'parent_id');
  return {
    id: folderId(readString(row, 'id')),
    parentId: parent === null ? null : folderId(parent),
    name: readString(row, 'name'),
    description: readString(row, 'description'),
  };
}

function mapEnvironment(row: Row, tagNames: readonly string[]): Environment {
  const folder = readNullableString(row, 'folder_id');
  return {
    id: environmentId(readString(row, 'id')),
    folderId: folder === null ? null : folderId(folder),
    name: readString(row, 'name'),
    endpoint: {
      host: readString(row, 'host'),
      port: readInteger(row, 'port'),
      subjectPrefix: readString(row, 'subject_prefix'),
      httpPort: readInteger(row, 'http_port'),
    },
    description: readString(row, 'description'),
    tags: [...tagNames],
    updatedAt: readString(row, 'updated_at'),
  };
}

function mapConnection(row: Row, tagNames: readonly string[]): Connection {
  const folder = readNullableString(row, 'folder_id');
  const environment = readNullableString(row, 'environment_id');

  // The CHECK constraint permits exactly one of these shapes, so the
  // standalone branch always has both a host and a port.
  const target: ConnectionTarget =
    environment !== null
      ? { kind: 'environment', environmentId: environmentId(environment) }
      : {
          kind: 'standalone',
          endpoint: {
            host: readString(row, 'host'),
            port: readInteger(row, 'port'),
            subjectPrefix: '',
            httpPort: 8080,
          },
        };

  const encrypted = readString(row, 'encrypted_password');

  return {
    id: connectionId(readString(row, 'id')),
    folderId: folder === null ? null : folderId(folder),
    name: readString(row, 'name'),
    target,
    username: readString(row, 'username'),
    encryptedPassword: encrypted === '' ? null : (encrypted as EncryptedSecret),
    description: readString(row, 'description'),
    tags: [...tagNames],
    updatedAt: readString(row, 'updated_at'),
  };
}

export type { Endpoint };
