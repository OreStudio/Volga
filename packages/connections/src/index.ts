/**
 * `@volga/connections` is Volga's own connections store.
 *
 * It holds the environments a person can connect to and the credentials they
 * have saved for them, in a file that belongs to them and lives on their
 * machine. It is readable before sign-in, which is the whole point: the store
 * answers "where can I connect", and sign-in answers "who am I".
 */

export {
  ConnectionsStoreError,
  NotFoundError,
  StoreLockedError,
  WrongMasterPasswordError,
  openConnectionsStore,
} from './store.js';
export type {
  ConnectionInput,
  ConnectionsStore,
  EnvironmentInput,
  UnlockState,
} from './store.js';

export { SchemaTooNewError, SCHEMA_VERSION } from './schema.js';
export { openStore } from './database.js';
export type { OpenOptions, OpenedStore } from './database.js';

export {
  DATA_DIR_ENVIRONMENT_VARIABLE,
  databasePath,
  defaultDataDirectory,
  resolveStoreLocation,
} from './paths.js';
export type { StoreLocation } from './paths.js';

export {
  DecryptionFailedError,
  createVerifier,
  decryptSecret,
  encryptSecret,
  verifyMasterPassword,
} from './crypto.js';
export type { EncryptedSecret, Verifier } from './crypto.js';

export {
  connectionId,
  environmentId,
  folderId,
  isUsableKey,
  tagId,
} from './types.js';
export {
  LegacyStoreError,
  decryptLegacySecret,
  legacyToSnapshot,
  readLegacyStore,
  verifyLegacyPassword,
} from './legacy.js';
export type { LegacyConnection, LegacyStore } from './legacy.js';

export type {
  Connection,
  ConnectionId,
  ConnectionSummary,
  ConnectionTarget,
  ConnectionsSnapshot,
  Endpoint,
  Environment,
  EnvironmentId,
  EnvironmentSummary,
  Folder,
  FolderId,
  Tag,
  TagId,
} from './types.js';

// Moving a store to another machine, either exactly or as a mergeable file.
export {
  SnapshotError,
  buildSnapshot,
  exportStoreBytes,
  importSnapshot,
  parseSnapshot,
  serialiseSnapshot,
  snapshotFromStoreBytes,
  SNAPSHOT_KIND,
  SNAPSHOT_VERSION,
} from './snapshot.js';
export type {
  ConflictStrategy,
  ImportOptions,
  ImportReport,
  Snapshot,
  SnapshotConnection,
  SnapshotEnvironment,
  SnapshotOptions,
} from './snapshot.js';
