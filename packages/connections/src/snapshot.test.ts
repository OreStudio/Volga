import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConnectionsStore, type ConnectionsStore } from './store.js';
import {
  SnapshotError,
  buildSnapshot,
  exportStoreBytes,
  importSnapshot,
  parseSnapshot,
  serialiseSnapshot,
  snapshotFromStoreBytes,
} from './snapshot.js';

/**
 * Moving a store between machines.
 *
 * Two paths are covered because they answer different needs: copying the file,
 * which is exact, and a snapshot, which merges and can be inspected.
 */

const MASTER = 'master-password-123';
const SAME_MASTER = 'master-password-123';

let directory: string;
let source: ConnectionsStore;
let target: ConnectionsStore;

function openIn(name: string): ConnectionsStore {
  return openConnectionsStore({ path: join(directory, name) });
}

/** A store with one environment, two labels and one saved connection. */
function populate(store: ConnectionsStore): void {
  store.unlock(MASTER);
  const environment = store.saveEnvironment({
    name: 'local1',
    host: 'localhost',
    port: 21005,
    httpPort: 21000,
    subjectPrefix: 'ores.dev.local1',
    description: 'local development',
    tagNames: ['dev', 'acme'],
  });
  store.saveConnection({
    name: 'local1: admin',
    target: { kind: 'environment', environmentId: environment.id },
    username: 'admin',
    password: 'hunter2',
    description: 'Head of Desk',
    tagNames: ['dev'],
  });
  store.saveConnection({
    name: 'direct',
    target: {
      kind: 'standalone',
      endpoint: { host: 'example.test', port: 4222, subjectPrefix: '', httpPort: 8080 },
    },
    username: 'someone',
  });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'volga-snapshot-'));
  source = openIn('source.db');
  target = openIn('target.db');
});

afterEach(() => {
  source.close();
  target.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('exporting the file bytes', () => {
  // Copying the store to another machine is the browser writing these bytes
  // wherever the person chooses, so the bytes have to be a complete store on
  // their own.
  it('produces bytes that open as the same store', () => {
    populate(source);
    const copy = join(directory, 'carried-to-another-machine.db');
    writeFileSync(copy, exportStoreBytes(source));

    const moved = openConnectionsStore({ path: copy });
    try {
      expect(moved.listEnvironments().map((item) => item.name)).toEqual(['local1']);
      expect(moved.listConnections().map((item) => item.name)).toEqual(['direct', 'local1: admin']);
      expect(moved.unlock(SAME_MASTER).unlocked).toBe(true);
      expect(moved.resolvePassword(moved.listConnections()[1]!.id)).toBe('hunter2');
      expect(moved.environmentSummaries()[0]?.tagNames).toEqual(['acme', 'dev']);
    } finally {
      moved.close();
    }
  });

  it('needs no companion files beside it', () => {
    populate(source);
    const copy = join(directory, 'single.db');
    writeFileSync(copy, exportStoreBytes(source));

    // The write-ahead log is folded in first, so the single file is complete.
    const moved = openConnectionsStore({ path: copy });
    try {
      expect(moved.state().uninitialised).toBe(false);
      expect(moved.listConnections()).toHaveLength(2);
    } finally {
      moved.close();
    }
  });
});

describe('importing another store file', () => {
  it('reads structure and credentials from the bytes', () => {
    populate(source);
    const { snapshot, passwords } = snapshotFromStoreBytes(exportStoreBytes(source), {
      sourcePassword: SAME_MASTER,
      includeCredentials: true,
    });

    expect(snapshot.environments.map((item) => item.name)).toEqual(['local1']);
    expect(snapshot.connections).toHaveLength(2);
    // Passwords travel beside the snapshot, already decrypted, so the import
    // can encrypt them under the destination's password.
    expect(passwords.size).toBe(1);

    const report = importSnapshot(target, snapshot, {
      passwords,
      targetPassword: 'the-destination-master',
    });
    expect(report.passwordsImported).toBe(1);

    const imported = target.listConnections().find((item) => item.name === 'local1: admin');
    expect(target.resolvePassword(imported!.id)).toBe('hunter2');
  });

  it('imports without credentials when the master password is unknown', () => {
    populate(source);
    const { snapshot, passwords, credentialsAvailable } = snapshotFromStoreBytes(
      exportStoreBytes(source),
      { sourcePassword: '', includeCredentials: false },
    );

    expect(passwords.size).toBe(0);
    expect(credentialsAvailable.size).toBe(1);
    const report = importSnapshot(target, snapshot, {
      targetPassword: SAME_MASTER,
      credentialsAvailable,
    });
    // The person is told a password was left behind, not left to discover it.
    expect(report.passwordsDropped).toBe(1);
    expect(target.listConnections()).toHaveLength(2);
    expect(target.listConnections().every((item) => item.encryptedPassword === null)).toBe(true);
  });

  it('reports a wrong source password rather than importing silently', () => {
    populate(source);
    expect(() =>
      snapshotFromStoreBytes(exportStoreBytes(source), {
        sourcePassword: 'wrong',
        includeCredentials: true,
      }),
    ).toThrow();
  });

  it('refuses a file that is not a Volga store', () => {
    expect(() =>
      snapshotFromStoreBytes(Buffer.from('this is not a database'), {
        sourcePassword: '',
        includeCredentials: false,
      }),
    ).toThrow();
  });

  it('leaves nothing behind in the temporary directory', () => {
    populate(source);
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith('volga-import-'));
    snapshotFromStoreBytes(exportStoreBytes(source), {
      sourcePassword: SAME_MASTER,
      includeCredentials: true,
    });
    const after = readdirSync(tmpdir()).filter((name) => name.startsWith('volga-import-'));
    expect(after).toEqual(before);
  });
});

describe('buildSnapshot', () => {
  it('carries the structure and encrypted passwords', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());

    expect(snapshot.kind).toBe('volga.connections.snapshot');
    expect(snapshot.environments).toHaveLength(1);
    expect(snapshot.connections).toHaveLength(2);
    expect(snapshot.environments[0]?.tags).toEqual(['acme', 'dev']);

    const withPassword = snapshot.connections.find((item) => item.name === 'local1: admin');
    expect(withPassword?.encryptedPassword).not.toBeNull();
  });

  it('never writes a plaintext password', () => {
    populate(source);
    const text = serialiseSnapshot(buildSnapshot(source.snapshot()));
    expect(text).not.toContain('hunter2');
  });

  it('omits passwords when asked, so it can be shared', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot(), { includePasswords: false });
    expect(snapshot.connections.every((item) => item.encryptedPassword === null)).toBe(true);
    // The structure and the usernames still travel.
    expect(snapshot.connections.map((item) => item.username).sort()).toEqual(['admin', 'someone']);
  });

  it('is reproducible, so a stored snapshot diffs cleanly', () => {
    populate(source);
    const at = '2026-01-01T00:00:00.000Z';
    const first = serialiseSnapshot(buildSnapshot(source.snapshot(), { exportedAt: at }));
    const second = serialiseSnapshot(buildSnapshot(source.snapshot(), { exportedAt: at }));
    // Same store, same recorded time, same bytes. Without ordered output, a
    // snapshot kept in version control would show noise on every run.
    expect(first).toBe(second);
  });

  it('can narrow to one environment', () => {
    populate(source);
    const other = source.saveEnvironment({ name: 'other', host: 'h', port: 1 });
    source.saveConnection({
      name: 'other: user',
      target: { kind: 'environment', environmentId: other.id },
      username: 'user',
    });

    const snapshot = buildSnapshot(source.snapshot(), { environmentIds: [other.id] });
    expect(snapshot.environments.map((item) => item.name)).toEqual(['other']);
    expect(snapshot.connections.map((item) => item.name)).toEqual(['other: user']);
  });
});

describe('parseSnapshot', () => {
  it('round-trips a serialised snapshot', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    expect(parseSnapshot(serialiseSnapshot(snapshot))).toEqual(snapshot);
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseSnapshot('not json')).toThrow(SnapshotError);
  });

  it('rejects a different kind of file', () => {
    expect(() => parseSnapshot(JSON.stringify({ kind: 'something.else', version: 1 }))).toThrow(
      /not a Volga connections snapshot/,
    );
  });

  it('rejects a snapshot from a newer build', () => {
    populate(source);
    const snapshot = { ...buildSnapshot(source.snapshot()), version: 99 };
    expect(() => parseSnapshot(JSON.stringify(snapshot))).toThrow(/newer Volga/);
  });

  it('rejects a record missing a required field', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    const broken = {
      ...snapshot,
      environments: [{ ...snapshot.environments[0], name: '' }],
    };
    expect(() => parseSnapshot(JSON.stringify(broken))).toThrow(SnapshotError);
  });
});

describe('importSnapshot', () => {
  it('brings a source store into an empty one', () => {
    populate(source);
    const report = importSnapshot(target, buildSnapshot(source.snapshot()), {
      sourcePassword: SAME_MASTER,
      targetPassword: SAME_MASTER,
    });

    expect(report.environments).toBe(1);
    expect(report.connections).toBe(2);
    expect(report.passwordsImported).toBe(1);
    expect(report.passwordsDropped).toBe(0);

    expect(target.listEnvironments().map((item) => item.name)).toEqual(['local1']);
    expect(target.environmentSummaries()[0]?.tagNames).toEqual(['acme', 'dev']);
  });

  it('re-encrypts passwords under the destination master password', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());

    // A different master password on the destination, so the imported password
    // has to be re-encrypted rather than copied across.
    importSnapshot(target, snapshot, {
      sourcePassword: SAME_MASTER,
      targetPassword: 'a-completely-different-master',
    });

    const imported = target.listConnections().find((item) => item.name === 'local1: admin');
    expect(target.resolvePassword(imported!.id)).toBe('hunter2');

    // The original master password no longer opens the destination.
    target.lock();
    expect(() => target.unlock(SAME_MASTER)).toThrow();
    expect(target.unlock('a-completely-different-master').unlocked).toBe(true);
  });

  it('refuses to import passwords without the source password', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    expect(() => importSnapshot(target, snapshot, { targetPassword: SAME_MASTER })).toThrow(
      /sourcePassword/,
    );
  });

  it('reports a source password that does not match', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    expect(() =>
      importSnapshot(target, snapshot, {
        sourcePassword: 'wrong',
        targetPassword: SAME_MASTER,
      }),
    ).toThrow(/does not match/);
  });

  it('drops passwords when asked instead of failing', () => {
    populate(source);
    const report = importSnapshot(target, buildSnapshot(source.snapshot()), {
      dropPasswords: true,
      targetPassword: SAME_MASTER,
    });
    expect(report.passwordsDropped).toBe(1);
    expect(report.passwordsImported).toBe(0);
    expect(target.connectionSummaries()).toHaveLength(2);
  });

  it('refuses to import passwords into a locked store', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    expect(() => importSnapshot(target, snapshot, { sourcePassword: SAME_MASTER })).toThrow(
      /must be unlocked/,
    );
  });

  it('skips records whose name already exists, by default', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    importSnapshot(target, snapshot, { sourcePassword: SAME_MASTER, targetPassword: SAME_MASTER });
    const second = importSnapshot(target, snapshot, {
      sourcePassword: SAME_MASTER,
      targetPassword: SAME_MASTER,
    });

    expect(second.environments).toBe(0);
    expect(second.connections).toBe(0);
    expect(second.skipped).toContain('environment local1');
    expect(second.skipped).toContain('connection local1: admin');
    expect(target.listConnections()).toHaveLength(2);
  });

  it('renames records on request, so both survive', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    importSnapshot(target, snapshot, { sourcePassword: SAME_MASTER, targetPassword: SAME_MASTER });
    const second = importSnapshot(target, snapshot, {
      conflict: 'rename',
      sourcePassword: SAME_MASTER,
      targetPassword: SAME_MASTER,
    });

    expect(second.renamed).toContainEqual({ from: 'local1', to: 'local1 (2)' });
    expect(target.listEnvironments().map((item) => item.name)).toEqual(['local1', 'local1 (2)']);
    expect(target.listConnections()).toHaveLength(4);
  });

  it('repoints a renamed environment at its connection', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    importSnapshot(target, snapshot, { sourcePassword: SAME_MASTER, targetPassword: SAME_MASTER });
    importSnapshot(target, snapshot, {
      conflict: 'rename',
      sourcePassword: SAME_MASTER,
      targetPassword: SAME_MASTER,
    });

    // The renamed copy's connection must point at the renamed environment, not
    // at the original. That is the whole hazard of merging by hand.
    const renamedEnvironment = target
      .listEnvironments()
      .find((item) => item.name === 'local1 (2)');
    const renamedConnection = target
      .connectionSummaries()
      .find((item) => item.name === 'local1: admin (2)');

    expect(renamedConnection?.environment).toEqual({
      kind: 'environment',
      id: renamedEnvironment?.id,
      name: 'local1 (2)',
    });
  });

  it('replaces records on request', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    importSnapshot(target, snapshot, { sourcePassword: SAME_MASTER, targetPassword: SAME_MASTER });

    // Change the source, then replace.
    source.saveEnvironment({ name: 'local1', host: 'changed.example', port: 9999 }, source.listEnvironments()[0]!.id);
    const updated = buildSnapshot(source.snapshot());

    const report = importSnapshot(target, updated, {
      conflict: 'replace',
      sourcePassword: SAME_MASTER,
      targetPassword: SAME_MASTER,
    });
    expect(report.replaced).toContain('environment local1');
    expect(target.listEnvironments()).toHaveLength(1);
    expect(target.listEnvironments()[0]?.endpoint.host).toBe('changed.example');
  });

  it('refuses a snapshot whose connection names a missing environment', () => {
    populate(source);
    const snapshot = buildSnapshot(source.snapshot());
    const broken = {
      ...snapshot,
      environments: [],
    };
    expect(() =>
      importSnapshot(target, parseSnapshot(JSON.stringify(broken)), {
        dropPasswords: true,
        targetPassword: MASTER,
      }),
    ).toThrow(/refers to environment/);
  });
});

describe('a snapshot written to a file and read back', () => {
  it('moves a store between two databases', () => {
    populate(source);
    const file = join(directory, 'connections.snapshot.json');
    writeFileSync(file, serialiseSnapshot(buildSnapshot(source.snapshot())));

    const text = readFileSync(file, 'utf8');
    const report = importSnapshot(target, parseSnapshot(text), {
      sourcePassword: SAME_MASTER,
      targetPassword: SAME_MASTER,
    });

    expect(report.connections).toBe(2);
    expect(target.connectionSummaries().map((item) => item.name)).toEqual([
      'direct',
      'local1: admin',
    ]);
  });
});
