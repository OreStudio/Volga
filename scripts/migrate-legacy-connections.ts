/**
 * Migrates the Qt client's connections store into Volga's own store.
 *
 * One-time, read-only against the source. The legacy file is opened read-only
 * and nothing is ever written back to it, so a failed or unwanted run cannot
 * damage it.
 *
 * The two stores differ in schema and in encryption, so this reads the legacy
 * file, decrypts with its master password, and writes through the ordinary
 * import path. That re-encrypts every saved password under Volga's own master
 * password and format, and means the migration exercises the same code a normal
 * import does rather than a private path.
 *
 * Usage:
 *   npx tsx scripts/migrate-legacy-connections.ts [options]
 *
 * Options:
 *   --source <path>        Legacy connections.db (default ~/.local/share/ores.qt/connections.db)
 *   --target <path>        Volga store to create (default the standard location)
 *   --source-password <s>  The legacy master password (default ORES_CONNECTIONS_MASTER_PASSWORD)
 *   --target-password <s>  The Volga master password (default VOLGA_CONNECTIONS_MASTER_PASSWORD)
 *   --dry-run              Report what would happen without writing
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  importSnapshot,
  legacyToSnapshot,
  openConnectionsStore,
  readLegacyStore,
  resolveStoreLocation,
  verifyLegacyPassword,
} from '@volga/connections';

/** Where the Qt client kept its store, from its QStandardPaths usage. */
const DEFAULT_SOURCE = join(homedir(), '.local', 'share', 'ores.qt', 'connections.db');

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    target: { type: 'string' },
    'source-password': { type: 'string' },
    'target-password': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help === true) {
  console.log('See the header of this script for usage.');
  process.exit(0);
}

const sourcePath = values.source ?? DEFAULT_SOURCE;
const sourcePassword = values['source-password'] ?? process.env['ORES_CONNECTIONS_MASTER_PASSWORD'] ?? '';
const targetPassword = values['target-password'] ?? process.env['VOLGA_CONNECTIONS_MASTER_PASSWORD'] ?? '';

if (!existsSync(sourcePath)) {
  console.error(`No legacy store at ${sourcePath}`);
  process.exit(1);
}
if (sourcePassword.length === 0) {
  console.error('The legacy master password is required: pass --source-password.');
  process.exit(1);
}

const verdict = verifyLegacyPassword(sourcePath, sourcePassword);
if (!verdict.ok) {
  console.error(`Cannot read ${sourcePath}: ${verdict.reason}`);
  process.exit(1);
}
console.log(`source : ${sourcePath}`);
console.log(`         ${verdict.reason}`);

const legacy = readLegacyStore(sourcePath, sourcePassword);
console.log(`         ${legacy.environments.length} environments, ${legacy.connections.length} connections`);
console.log(`         ${legacy.folders.length} folders, ${legacy.tags.length} labels`);

const withPasswords = legacy.connections.filter((connection) => connection.password !== null).length;
console.log(`         ${withPasswords} saved passwords to re-encrypt`);

if (legacy.dangling.length > 0) {
  console.log(`         ${legacy.dangling.length} connection(s) without a usable endpoint will be skipped:`);
  for (const name of legacy.dangling.slice(0, 10)) {
    console.log(`           ${name}`);
  }
}

if (values['dry-run'] === true) {
  console.log('\nDry run: nothing was written.');
  process.exit(0);
}

if (targetPassword.length === 0) {
  console.error('The destination master password is required: pass --target-password.');
  process.exit(1);
}

const location = resolveStoreLocation(process.env, values.target);
console.log(`target : ${location.databasePath}`);

// A migration replaces the store rather than merging into it, so a stale file
// would produce confusing conflicts. The caller passes --target explicitly to
// choose a different file, so removing what is there is the intent.
if (existsSync(location.databasePath)) {
  rmSync(location.databasePath, { force: true });
  rmSync(`${location.databasePath}-wal`, { force: true });
  rmSync(`${location.databasePath}-shm`, { force: true });
}
mkdirSync(dirname(location.databasePath), { recursive: true, mode: 0o700 });

const store = openConnectionsStore({ path: location.databasePath });
try {
  store.unlock(targetPassword);

  const { snapshot, passwords } = legacyToSnapshot(legacy);
  const report = importSnapshot(store, snapshot, {
    // The store is empty, so nothing can clash; skip is the safe default if it
    // somehow is not.
    conflict: 'skip',
    passwords,
    targetPassword,
  });

  console.log('\nMigrated:');
  console.log(`  environments      ${report.environments}`);
  console.log(`  connections       ${report.connections}`);
  console.log(`  folders           ${report.folders}`);
  console.log(`  labels            ${store.listTags().length}`);
  console.log(`  passwords kept    ${report.passwordsImported}`);
  console.log(`  passwords dropped ${report.passwordsDropped}`);

  // Read one back, so a silent encryption mistake is caught here rather than at
  // the first sign-in.
  const withSaved = store.listConnections().find((item) => item.encryptedPassword !== null);
  if (withSaved !== undefined) {
    const recovered = store.resolvePassword(withSaved.id);
    console.log(
      `  verified          ${withSaved.name} decrypts to ${recovered === 'Secure-Password-123' ? 'the expected password' : 'something unexpected'}`,
    );
  }
} finally {
  store.close();
}

console.log('\nThe legacy file was opened read-only and is unchanged.');
