import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConnectionsStore } from './store.js';
import {
  LegacyStoreError,
  legacyToSnapshot,
  readLegacyStore,
  verifyLegacyPassword,
} from './legacy.js';
import { importSnapshot } from './snapshot.js';

/**
 * Reading a legacy store.
 *
 * The fixture is written here rather than taken from a real machine, so the
 * test states exactly which shapes the adapter has to handle: a connection that
 * names an environment, one with its own endpoint, a nested folder tree, labels,
 * and a password encrypted in the legacy format.
 */

const LEGACY_MASTER = 'legacy-master-password';
const NEW_MASTER = 'volga-master-password';
const PASSWORD = 'Secure-Password-123';

/** Encrypts the way the legacy client did, so the fixture is really legacy. */
function encryptLegacy(plaintext: string, masterPassword: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(masterPassword, salt, 600_000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

let directory: string;
let legacyPath: string;

/** Builds a legacy store with the shapes the adapter has to cope with. */
function writeLegacyStore(): void {
  const database = new DatabaseSync(legacyPath);
  database.exec(`
    CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, description TEXT);
    CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE environments (
      id TEXT PRIMARY KEY, folder_id TEXT, name TEXT NOT NULL, host TEXT NOT NULL,
      port INTEGER NOT NULL, description TEXT, subject_prefix TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE connections (
      id TEXT PRIMARY KEY, folder_id TEXT, environment_id TEXT, name TEXT NOT NULL,
      host TEXT, port INTEGER, username TEXT NOT NULL, encrypted_password TEXT, description TEXT
    );
    CREATE TABLE environment_tags (environment_id TEXT, tag_id TEXT, PRIMARY KEY (environment_id, tag_id));
    CREATE TABLE connection_tags (connection_id TEXT, tag_id TEXT, PRIMARY KEY (connection_id, tag_id));
    CREATE TABLE recent_parties (party_id TEXT PRIMARY KEY, party_name TEXT NOT NULL, last_selected_at TEXT);
  `);

  database.exec(`
    INSERT INTO folders VALUES ('f-root', 'Development', NULL, '');
    INSERT INTO folders VALUES ('f-dev', 'Dev', 'f-root', 'local work');
    INSERT INTO tags VALUES ('t-dev', 'dev');
    INSERT INTO tags VALUES ('t-prod', 'prod');
  `);

  database.exec(`
    INSERT INTO environments VALUES
      ('e-local1', 'f-dev', 'local1', 'localhost', 21005, 'local', 'ores.dev.local1'),
      ('e-local2', NULL, 'local2', 'localhost', 21006, '', 'ores.dev.local2');
  `);

  // One connection on an environment with a saved password, one standalone
  // without, and one that names an environment the file does not define.
  database
    .prepare(
      `INSERT INTO connections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run('c-1', 'f-dev', 'e-local1', 'local1: admin', null, null, 'admin', encryptLegacy(PASSWORD, LEGACY_MASTER), 'the admin');
  database
    .prepare(`INSERT INTO connections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('c-2', null, null, 'direct', 'example.test', 4222, 'someone', null, '');
  database
    .prepare(`INSERT INTO connections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('c-3', null, 'e-missing', 'dangling', null, null, 'ghost', encryptLegacy('x', LEGACY_MASTER), '');

  database.exec(`
    INSERT INTO environment_tags VALUES ('e-local1', 't-dev');
    INSERT INTO connection_tags VALUES ('c-1', 't-dev');
    INSERT INTO connection_tags VALUES ('c-1', 't-prod');
    INSERT INTO recent_parties VALUES ('p-1', 'System Party', '2026-01-01T00:00:00Z');
  `);
  database.close();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'volga-legacy-'));
  legacyPath = join(directory, 'connections.db');
  writeLegacyStore();
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('verifyLegacyPassword', () => {
  it('accepts the password that opens the store', () => {
    expect(verifyLegacyPassword(legacyPath, LEGACY_MASTER).ok).toBe(true);
  });

  it('rejects a wrong password', () => {
    const verdict = verifyLegacyPassword(legacyPath, 'not it');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/does not open/);
  });
});

describe('readLegacyStore', () => {
  it('reads the environments with their endpoints', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    const names = legacy.environments.map((item) => item.name);
    expect(names).toEqual(['local1', 'local2']);

    const local1 = legacy.environments[0];
    expect(local1?.endpoint.host).toBe('localhost');
    expect(local1?.endpoint.port).toBe(21005);
    expect(local1?.endpoint.subjectPrefix).toBe('ores.dev.local1');
    // The legacy store has no HTTP port, so the default is used.
    expect(local1?.endpoint.httpPort).toBe(8080);
  });

  it('reads the folder tree and pairs it with the folders used', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    expect(legacy.folders).toHaveLength(2);
    const child = legacy.folders.find((item) => item.name === 'Dev');
    const root = legacy.folders.find((item) => item.name === 'Development');
    expect(child?.parentId).toBe(root?.id);
  });

  it('reads labels for both environments and connections', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    expect(legacy.environments[0]?.tags).toEqual(['dev']);
    const admin = legacy.connections.find((item) => item.name === 'local1: admin');
    expect(admin?.tagNames).toEqual(['dev', 'prod']);
    expect(legacy.tags.map((tag) => tag.name)).toEqual(['dev', 'prod']);
  });

  it('decrypts a saved password', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    const admin = legacy.connections.find((item) => item.name === 'local1: admin');
    expect(admin?.password).toBe(PASSWORD);
  });

  it('leaves a connection with no saved password alone', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    const direct = legacy.connections.find((item) => item.name === 'direct');
    expect(direct?.password).toBeNull();
  });

  it('points a connection at its environment even when it also names a host', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    const admin = legacy.connections.find((item) => item.name === 'local1: admin');
    // The new schema allows one or the other, and the environment is what the
    // legacy client resolved.
    expect(admin?.target.kind).toBe('environment');
  });

  it('gives a standalone connection its own endpoint', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    const direct = legacy.connections.find((item) => item.name === 'direct');
    expect(direct?.target).toEqual({
      kind: 'standalone',
      endpoint: { host: 'example.test', port: 4222, subjectPrefix: '', httpPort: 8080 },
    });
  });

  it('names a connection that cannot be placed rather than dropping it silently', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    expect(legacy.dangling).toEqual(['dangling']);
    expect(legacy.connections.map((item) => item.name)).not.toContain('dangling');
  });

  it('refuses a wrong master password', () => {
    expect(() => readLegacyStore(legacyPath, 'wrong')).toThrow(LegacyStoreError);
  });

  it('refuses a file that is not a connections store', () => {
    const other = join(directory, 'other.db');
    const database = new DatabaseSync(other);
    database.exec('CREATE TABLE unrelated (id TEXT)');
    database.close();
    expect(() => readLegacyStore(other, LEGACY_MASTER)).toThrow(/not a connections store/);
  });
});

describe('migrating into a Volga store', () => {
  it('carries everything across and re-encrypts the passwords', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    const { snapshot, passwords } = legacyToSnapshot(legacy);

    const store = openConnectionsStore({ path: join(directory, 'volga.db') });
    try {
      store.unlock(NEW_MASTER);
      const report = importSnapshot(store, snapshot, { passwords, targetPassword: NEW_MASTER });

      expect(report.environments).toBe(2);
      // The dangling one is excluded, so the count matches what can be used.
      expect(report.connections).toBe(2);
      expect(report.folders).toBe(2);
      expect(report.passwordsImported).toBe(1);

      expect(store.listTags().map((tag) => tag.name)).toEqual(['dev', 'prod']);

      // The folder tree survives, so grouping is not lost.
      const folders = store.listFolders();
      expect(folders).toHaveLength(2);
      const root = folders.find((item) => item.name === 'Development');
      const child = folders.find((item) => item.name === 'Dev');
      expect(child?.parentId).toBe(root?.id);

      // The password is now under the new master password and the new format.
      const admin = store.listConnections().find((item) => item.name === 'local1: admin');
      expect(store.resolvePassword(admin!.id)).toBe(PASSWORD);
      expect(admin?.encryptedPassword).not.toBeNull();

      store.lock();
      expect(() => store.unlock(LEGACY_MASTER)).toThrow();
      expect(store.unlock(NEW_MASTER).unlocked).toBe(true);
    } finally {
      store.close();
    }
  });

  it('keeps the connection attached to the environment it named', () => {
    const legacy = readLegacyStore(legacyPath, LEGACY_MASTER);
    const { snapshot, passwords } = legacyToSnapshot(legacy);

    const store = openConnectionsStore({ path: join(directory, 'volga.db') });
    try {
      store.unlock(NEW_MASTER);
      importSnapshot(store, snapshot, { passwords, targetPassword: NEW_MASTER });

      const summary = store
        .connectionSummaries()
        .find((item) => item.name === 'local1: admin');
      expect(summary?.environment).toEqual({
        kind: 'environment',
        id: store.listEnvironments().find((item) => item.name === 'local1')?.id,
        name: 'local1',
      });
    } finally {
      store.close();
    }
  });
});
