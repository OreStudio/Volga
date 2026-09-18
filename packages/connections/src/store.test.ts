import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConnectionsStore, type ConnectionsStore } from './store.js';
import { StoreLockedError, WrongMasterPasswordError } from './store.js';
import { environmentId } from './types.js';

/**
 * The store's behaviour, exercised against a real SQLite file rather than a
 * double, because the integrity rules live in the schema and a mock would not
 * have them.
 */

const MASTER = 'master-password-123';

let directory: string;
let path: string;
let store: ConnectionsStore;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'volga-connections-'));
  path = join(directory, 'connections.db');
  store = openConnectionsStore({ path });
});

afterEach(() => {
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('opening', () => {
  it('creates the file and reports it', () => {
    expect(store.created).toBe(true);
    expect(store.state().uninitialised).toBe(true);
  });

  it('reports the location so a person can find it', () => {
    expect(store.location.databasePath).toBe(path);
    expect(store.location.directory).toBe(directory);
  });

});

describe('the master password', () => {
  it('accepts the first password offered on a fresh store', () => {
    const state = store.unlock(MASTER);
    expect(state.unlocked).toBe(true);
    expect(state.uninitialised).toBe(false);
  });

  it('rejects a different password afterwards', () => {
    store.unlock(MASTER);
    store.lock();
    expect(() => store.unlock('something else')).toThrow(WrongMasterPasswordError);
  });

  it('rejects an empty store being unlocked with nothing', () => {
    store.unlock('');
    store.lock();
    expect(() => store.unlock('any')).toThrow(WrongMasterPasswordError);
  });

  it('reports an empty store as having no saved passwords', () => {
    store.unlock(MASTER);
    expect(store.state().hasSavedPasswords).toBe(false);
  });
});

describe('environments', () => {
  it('saves and reads one back', () => {
    const saved = store.saveEnvironment({
      name: 'local1',
      host: 'localhost',
      port: 21005,
      httpPort: 21000,
      subjectPrefix: 'ores.dev.local1',
      description: 'local development',
    });

    const found = store.getEnvironment(saved.id);
    expect(found?.name).toBe('local1');
    expect(found?.endpoint).toEqual({
      host: 'localhost',
      port: 21005,
      httpPort: 21000,
      subjectPrefix: 'ores.dev.local1',
    });
  });

  it('defaults the http port', () => {
    const saved = store.saveEnvironment({ name: 'e', host: 'h', port: 1 });
    expect(saved.endpoint.httpPort).toBe(8080);
  });

  it('trims the name and refuses an empty one', () => {
    expect(store.saveEnvironment({ name: '  padded  ', host: 'h', port: 1 }).name).toBe('padded');
    expect(() => store.saveEnvironment({ name: '   ', host: 'h', port: 1 })).toThrow(/cannot be empty/);
  });

  it('refuses an out-of-range port', () => {
    expect(() => store.saveEnvironment({ name: 'e', host: 'h', port: 0 })).toThrow(/between 1 and 65535/);
    expect(() => store.saveEnvironment({ name: 'e', host: 'h', port: 70_000 })).toThrow(/between 1 and 65535/);
  });

  it('refuses a duplicate name', () => {
    store.saveEnvironment({ name: 'same', host: 'h', port: 1 });
    expect(() => store.saveEnvironment({ name: 'same', host: 'h', port: 2 })).toThrow();
  });

  it('lists in name order', () => {
    store.saveEnvironment({ name: 'zulu', host: 'h', port: 1 });
    store.saveEnvironment({ name: 'alpha', host: 'h', port: 2 });
    expect(store.listEnvironments().map((item) => item.name)).toEqual(['alpha', 'zulu']);
  });

  it('updates an existing environment', () => {
    const saved = store.saveEnvironment({ name: 'e', host: 'h', port: 1 });
    const updated = store.saveEnvironment({ name: 'renamed', host: 'h2', port: 2 }, saved.id);
    expect(updated.id).toBe(saved.id);
    expect(updated.name).toBe('renamed');
    expect(updated.endpoint.host).toBe('h2');
    expect(store.listEnvironments()).toHaveLength(1);
  });

  it('deletes one', () => {
    const saved = store.saveEnvironment({ name: 'e', host: 'h', port: 1 });
    store.deleteEnvironment(saved.id);
    expect(store.getEnvironment(saved.id)).toBeUndefined();
  });
});

describe('labels', () => {
  it('attaches names and reads them back sorted', () => {
    const saved = store.saveEnvironment({
      name: 'e',
      host: 'h',
      port: 1,
      tagNames: ['prod', 'acme'],
    });
    expect(saved.tags).toEqual(['acme', 'prod']);
  });

  it('reuses an existing label case-insensitively', () => {
    store.saveEnvironment({ name: 'a', host: 'h', port: 1, tagNames: ['Prod'] });
    store.saveEnvironment({ name: 'b', host: 'h', port: 2, tagNames: ['prod'] });
    expect(store.listTags()).toHaveLength(1);
  });

  it('replaces the label set on update rather than adding to it', () => {
    const saved = store.saveEnvironment({ name: 'e', host: 'h', port: 1, tagNames: ['one', 'two'] });
    const updated = store.saveEnvironment({ name: 'e', host: 'h', port: 1, tagNames: ['three'] }, saved.id);
    expect(updated.tags).toEqual(['three']);
  });

  it('surfaces label names on a summary', () => {
    store.saveEnvironment({ name: 'e', host: 'h', port: 1, tagNames: ['acme_uk'] });
    expect(store.environmentSummaries()[0]?.tagNames).toEqual(['acme_uk']);
  });
});

describe('connections', () => {
  it('saves one against an environment', () => {
    const environment = store.saveEnvironment({ name: 'local1', host: 'localhost', port: 21005 });
    const connection = store.saveConnection({
      name: 'local1: admin',
      target: { kind: 'environment', environmentId: environment.id },
      username: 'admin',
      description: 'Head of Desk',
    });

    expect(connection.target).toEqual({ kind: 'environment', environmentId: environment.id });
    expect(connection.encryptedPassword).toBeNull();
  });

  it('saves a standalone one with its own endpoint', () => {
    const connection = store.saveConnection({
      name: 'direct',
      target: { kind: 'standalone', endpoint: { host: 'example.test', port: 4222, subjectPrefix: '', httpPort: 8080 } },
      username: 'someone',
    });
    expect(connection.target.kind).toBe('standalone');
  });

  it('refuses a connection pointing at an environment that does not exist', () => {
    expect(() =>
      store.saveConnection({
        name: 'dangling',
        target: {
          kind: 'environment',
          environmentId: environmentId('11111111-1111-1111-1111-111111111111'),
        },
        username: 'u',
      }),
    ).toThrow(/No environment/);
  });

  it('encrypts a saved password and never returns it', () => {
    store.unlock(MASTER);
    const connection = store.saveConnection({
      name: 'c',
      target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
      username: 'u',
      password: 'hunter2',
    });

    expect(connection.encryptedPassword).not.toBeNull();
    expect(connection.encryptedPassword).not.toContain('hunter2');
    expect(store.state().hasSavedPasswords).toBe(true);
  });

  it('will not save a password while locked', () => {
    expect(() =>
      store.saveConnection({
        name: 'c',
        target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
        username: 'u',
        password: 'hunter2',
      }),
    ).toThrow(StoreLockedError);
  });

  it('resolves a saved password once unlocked', () => {
    store.unlock(MASTER);
    const connection = store.saveConnection({
      name: 'c',
      target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
      username: 'u',
      password: 'hunter2',
    });
    expect(store.resolvePassword(connection.id)).toBe('hunter2');
  });

  it('prefers a supplied password over the saved one', () => {
    store.unlock(MASTER);
    const connection = store.saveConnection({
      name: 'c',
      target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
      username: 'u',
      password: 'saved',
    });
    // Someone can sign in as a saved user with a different password without
    // editing the store.
    expect(store.resolvePassword(connection.id, 'typed')).toBe('typed');
  });

  it('refuses to resolve a saved password while locked', () => {
    store.unlock(MASTER);
    const connection = store.saveConnection({
      name: 'c',
      target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
      username: 'u',
      password: 'hunter2',
    });
    store.lock();
    expect(() => store.resolvePassword(connection.id)).toThrow(StoreLockedError);
  });

  it('keeps a saved password when the connection is edited without one', () => {
    store.unlock(MASTER);
    const connection = store.saveConnection({
      name: 'c',
      target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
      username: 'u',
      password: 'hunter2',
    });
    store.saveConnection(
      {
        name: 'renamed',
        target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
        username: 'u',
        description: 'edited',
      },
      connection.id,
    );
    expect(store.resolvePassword(connection.id)).toBe('hunter2');
  });

  it('describes a connection for display without exposing anything secret', () => {
    store.unlock(MASTER);
    const environment = store.saveEnvironment({ name: 'local1', host: 'localhost', port: 21005, tagNames: ['dev'] });
    store.saveConnection({
      name: 'local1: admin',
      target: { kind: 'environment', environmentId: environment.id },
      username: 'admin',
      password: 'hunter2',
      tagNames: ['acme'],
    });

    const summary = store.connectionSummaries()[0];
    expect(summary?.username).toBe('admin');
    expect(summary?.tagNames).toEqual(['acme']);
    expect(summary?.environment).toEqual({ kind: 'environment', id: environment.id, name: 'local1' });
    expect(JSON.stringify(summary)).not.toContain('hunter2');
    expect(JSON.stringify(summary)).not.toContain('encrypted');
  });
});

describe('changing the master password', () => {
  it('re-encrypts every saved password', () => {
    store.unlock(MASTER);
    const first = store.saveConnection({
      name: 'a',
      target: { kind: 'standalone', endpoint: { host: 'h', port: 1, subjectPrefix: '', httpPort: 8080 } },
      username: 'u',
      password: 'one',
    });
    const second = store.saveConnection({
      name: 'b',
      target: { kind: 'standalone', endpoint: { host: 'h', port: 2, subjectPrefix: '', httpPort: 8080 } },
      username: 'u',
      password: 'two',
    });

    store.changeMasterPassword(MASTER, 'a-brand-new-master');
    expect(store.resolvePassword(first.id)).toBe('one');
    expect(store.resolvePassword(second.id)).toBe('two');

    store.lock();
    expect(() => store.unlock(MASTER)).toThrow(WrongMasterPasswordError);
    expect(store.unlock('a-brand-new-master').unlocked).toBe(true);
  });

  it('refuses to change with the wrong current password', () => {
    store.unlock(MASTER);
    expect(() => store.changeMasterPassword('wrong', 'new')).toThrow(WrongMasterPasswordError);
  });
});

describe('persistence', () => {
  it('survives reopening the file', () => {
    store.unlock(MASTER);
    const environment = store.saveEnvironment({ name: 'local1', host: 'localhost', port: 21005, tagNames: ['dev'] });
    store.saveConnection({
      name: 'local1: admin',
      target: { kind: 'environment', environmentId: environment.id },
      username: 'admin',
      password: 'hunter2',
    });
    store.close();

    store = openConnectionsStore({ path });
    expect(store.created).toBe(false);
    expect(store.listEnvironments()).toHaveLength(1);
    expect(store.connectionSummaries()).toHaveLength(1);
    expect(store.environmentSummaries()[0]?.tagNames).toEqual(['dev']);

    expect(store.unlock(MASTER).unlocked).toBe(true);
    expect(store.resolvePassword(store.listConnections()[0]!.id)).toBe('hunter2');
  });
});
