/**
 * Seeds a connections store for the browser verification.
 *
 * A store with no environments cannot be signed in to, and creating one through
 * the interface is covered separately, so this puts the fixture in place before
 * the browser starts.
 *
 * Run:
 *   npx tsx scripts/seed-connections-store.ts [path]
 */
import { rmSync } from 'node:fs';
import { openConnectionsStore } from '@volga/connections';

const path = process.argv[2] ?? '.runtime/verify-connections.db';
const masterPassword = process.env['VOLGA_CONNECTIONS_MASTER_PASSWORD'] ?? 'verify-master-password';

rmSync(path, { force: true });
rmSync(`${path}-wal`, { force: true });
rmSync(`${path}-shm`, { force: true });

const store = openConnectionsStore({ path });
store.unlock(masterPassword);

const environment = store.saveEnvironment({
  name: 'festive_dijkstra',
  host: process.env['ORES_HOST'] ?? 'localhost',
  port: Number(process.env['ORES_NATS_PORT'] ?? 21805),
  httpPort: 21800,
  subjectPrefix: process.env['ORES_NATS_SUBJECT_PREFIX'] ?? 'ores.dev.festive.dijkstra',
  description: 'the environment under test',
  tagNames: ['dev'],
});

store.saveConnection({
  name: 'festive_dijkstra: volga_probe',
  target: { kind: 'environment', environmentId: environment.id },
  username: process.env['ORES_PRINCIPAL'] ?? 'volga_probe',
  password: process.env['ORES_PASSWORD'] ?? 'Secure-Password-123',
  description: 'the test account',
  tagNames: ['dev'],
});

console.log(`seeded ${path}`);
console.log(`  ${store.listEnvironments().length} environment(s), ${store.listConnections().length} connection(s)`);
store.close();
