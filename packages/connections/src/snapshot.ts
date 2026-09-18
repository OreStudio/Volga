import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { openConnectionsStore, type ConnectionsStore } from './store.js';
import { decryptSecret, encryptSecret, type EncryptedSecret } from './crypto.js';
import {
  connectionId as asConnectionId,
  environmentId as asEnvironmentId,
  folderId as asFolderId,
  type ConnectionsSnapshot,
  type ConnectionId,
  type ConnectionTarget,
  type Endpoint,
  type EnvironmentId,
  type FolderId,
} from './types.js';

/**
 * Moving a person's connections between stores.
 *
 * There are two operations, and they answer different needs.
 *
 * Copying the database file is the whole story for moving to another machine:
 * the file is the store, and copying it is exact. `copyStoreFile` does that.
 *
 * A snapshot is the other one. It carries the contents rather than the file, so
 * a store can be merged into one that already has data, records whose names
 * clash can be resolved, and a partial set can be selected. It is JSON so a
 * person can read it, diff it and keep it in version control.
 *
 * Passwords travel encrypted, never in the clear, so a snapshot is exactly as
 * safe as the master password it was written with. A recipient who does not
 * know that password gets the structure and the usernames, and nothing they can
 * sign in with.
 */

const SNAPSHOT_KIND = 'volga.connections.snapshot';
const SNAPSHOT_VERSION = 1;

const endpointSchema = z.object({
  host: z.string().min(1),
  port: z.int().min(1).max(65535),
  subjectPrefix: z.string(),
  httpPort: z.int().min(1).max(65535),
});

const folderSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  name: z.string().min(1),
  description: z.string(),
});

const environmentSchema = z.object({
  id: z.string().min(1),
  folderId: z.string().min(1).nullable(),
  name: z.string().min(1),
  endpoint: endpointSchema,
  description: z.string(),
  tags: z.array(z.string()),
});

const connectionSchema = z.object({
  id: z.string().min(1),
  folderId: z.string().min(1).nullable(),
  name: z.string().min(1),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('environment'), environmentId: z.string().min(1) }),
    z.object({ kind: z.literal('standalone'), endpoint: endpointSchema }),
  ]),
  username: z.string().min(1),
  /**
   * The stored password, still encrypted.
   *
   * Null means the connection has no saved password, not that one was withheld.
   */
  encryptedPassword: z.string().nullable(),
  description: z.string(),
  tags: z.array(z.string()),
});

const snapshotSchema = z.object({
  kind: z.literal(SNAPSHOT_KIND),
  version: z.int().positive(),
  /** Which application wrote the snapshot, for support and for provenance. */
  producedBy: z.string(),
  /** When it was written. */
  exportedAt: z.string(),
  /** A label for the snapshot, optional and free text. */
  note: z.string().default(''),
  folders: z.array(folderSchema),
  environments: z.array(environmentSchema),
  connections: z.array(connectionSchema),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotEnvironment = z.infer<typeof environmentSchema>;
export type SnapshotConnection = z.infer<typeof connectionSchema>;

export class SnapshotError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SnapshotError';
  }
}

/** What a snapshot should include. */
export interface SnapshotOptions {
  /**
   * Whether to include saved passwords.
   *
   * Off produces an snapshot that is safe to share: the structure and the
   * usernames travel, the credentials stay behind. On produces a full backup.
   */
  readonly includePasswords?: boolean;
  readonly note?: string;
  /** Restricts the snapshot to these environments and their connections. */
  readonly environmentIds?: readonly string[];
  /**
   * Overrides the recorded timestamp.
   *
   * Injecting it is what makes a snapshot reproducible, which matters for tests
   * and for anyone who keeps one in version control.
   */
  readonly exportedAt?: string;
}

/**
 * Reads a store's contents into a snapshot.
 *
 * The ordering is normalised, so snapshotting the same store twice produces the
 * same bytes and a diff between two files shows real changes only.
 */
export function buildSnapshot(
  snapshot: ConnectionsSnapshot,
  options: SnapshotOptions = {},
): Snapshot {
  const includePasswords = options.includePasswords ?? true;
  const selected = options.environmentIds;
  const wanted = selected === undefined ? undefined : new Set(selected);

  const environments = snapshot.environments
    .filter((environment) => wanted === undefined || wanted.has(environment.id))
    .map((environment) => ({
      id: environment.id,
      folderId: environment.folderId,
      name: environment.name,
      endpoint: environment.endpoint,
      description: environment.description,
      tags: [...environment.tags].sort(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const keptEnvironmentIds = new Set(environments.map((environment) => environment.id));

  const connections = snapshot.connections
    .filter((connection) => {
      if (wanted === undefined) {
        return true;
      }
      // A standalone connection is not attached to an environment, so a
      // filtered export keeps it only when no filter was asked for.
      return (
        connection.target.kind === 'environment' &&
        keptEnvironmentIds.has(connection.target.environmentId)
      );
    })
    .map((connection) => ({
      id: connection.id,
      folderId: connection.folderId,
      name: connection.name,
      target: connection.target,
      username: connection.username,
      encryptedPassword:
        includePasswords && connection.encryptedPassword !== null
          ? connection.encryptedPassword
          : null,
      description: connection.description,
      tags: [...connection.tags].sort(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  // Folders are kept only when something inside them survives the filter.
  const usedFolders = new Set<string>();
  for (const environment of environments) {
    if (environment.folderId !== null) {
      usedFolders.add(environment.folderId);
    }
  }
  for (const connection of connections) {
    if (connection.folderId !== null) {
      usedFolders.add(connection.folderId);
    }
  }
  const folders = snapshot.folders
    .filter((folder) => usedFolders.has(folder.id))
    .map((folder) => ({
      id: folder.id,
      parentId: folder.parentId,
      name: folder.name,
      description: folder.description,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    producedBy: 'volga',
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    note: options.note ?? '',
    folders,
    environments,
    connections,
  };
}

/** Serialises an snapshot for writing to a file. */
export function serialiseSnapshot(snapshot: Snapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

/**
 * Reads an snapshot, validating it rather than trusting its shape.
 *
 * @throws {SnapshotError} when the text is not valid JSON, is not a Volga
 * snapshot, or was written by a version this build does not understand.
 */
export function parseSnapshot(text: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new SnapshotError('That file is not valid JSON', { cause });
  }

  const envelope = z.object({ kind: z.string(), version: z.number() }).safeParse(value);
  if (envelope.success && envelope.data.kind !== SNAPSHOT_KIND) {
    throw new SnapshotError(
      `That file is a ${envelope.data.kind} snapshot, not a Volga connections snapshot`,
    );
  }

  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new SnapshotError(`That snapshot is not readable: ${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.version > SNAPSHOT_VERSION) {
    throw new SnapshotError(
      `That snapshot was written by a newer Volga (version ${parsed.data.version}); ` +
        `this build understands ${SNAPSHOT_VERSION}`,
    );
  }
  return parsed.data;
}

/** How to treat a record whose name already exists in the store. */
export type ConflictStrategy =
  /** Keep what is already there and skip the incoming record. */
  | 'skip'
  /** Add the incoming record under a name that does not clash. */
  | 'rename'
  /** Replace the existing record. */
  | 'replace';

export interface ImportOptions {
  readonly conflict?: ConflictStrategy;
  /**
   * Saved passwords already decrypted, keyed by the snapshot's connection id.
   *
   * Used when the passwords came from another store rather than from the
   * snapshot's own encrypted fields, which is the case for a whole-file import.
   */
  readonly passwords?: ReadonlyMap<string, string>;
  /**
   * Snapshot connection ids that had a saved password, when that is known.
   *
   * A whole-file import knows this even when the credentials are deliberately
   * not carried across, and the report says how many were left behind rather
   * than staying silent about them.
   */
  readonly credentialsAvailable?: ReadonlySet<string>;
  /**
   * The master password that decrypts the snapshot's passwords.
   *
   * Needed only when the snapshot carries saved passwords and those passwords
   * are to be kept. Supplying `dropPasswords` instead keeps the structure and
   * discards the credentials.
   */
  readonly sourcePassword?: string;
  /** Discards the snapshot's saved passwords rather than re-encrypting them. */
  readonly dropPasswords?: boolean;
  /**
   * The store's master password, when the store is locked.
   *
   * Importing passwords writes to the store, so it needs the store's own
   * password to encrypt under. Read from the store when it is already unlocked.
   */
  readonly targetPassword?: string;
}

export interface ImportReport {
  readonly folders: number;
  readonly environments: number;
  readonly connections: number;
  /** Records left alone because their name already existed. */
  readonly skipped: readonly string[];
  /** Records added under an adjusted name. */
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  /** Records that replaced an existing one. */
  readonly replaced: readonly string[];
  /** Saved passwords carried across. */
  readonly passwordsImported: number;
  /** Saved passwords dropped because none could be re-encrypted. */
  readonly passwordsDropped: number;
}

/**
 * Reads another Volga store's database bytes and turns them into a snapshot.
 *
 * This is what an import from a file the person chose does. The incoming file
 * is a Volga store, so it is opened read-only through the same schema and the
 * same types as the local one; there is no separate import format to keep in
 * step, and a file that is not a Volga store is refused by the schema rather
 * than half-understood.
 *
 * Nothing is written to the incoming file, and the temporary store is closed
 * before this returns.
 *
 * @param bytes The whole database file.
 * @param options.sourcePassword The incoming store's master password.
 * @param options.includeCredentials False drops the saved passwords, so a file
 * can be imported without knowing its master password.
 * @throws {StoreLockedError} when the file holds saved passwords and none of
 * them could be decrypted with the password given.
 * @throws {SchemaTooNewError} when the file was written by a newer build.
 */
export function snapshotFromStoreBytes(
  bytes: Uint8Array,
  options: { readonly sourcePassword: string; readonly includeCredentials: boolean },
): {
  readonly snapshot: Snapshot;
  readonly passwords: ReadonlyMap<string, string>;
  readonly credentialsAvailable: ReadonlySet<string>;
} {
  // The file arrives as bytes, and SQLite needs a file to open, so it is placed
  // in a private temporary directory and removed whichever way this ends.
  // Nothing is written to the original, which never left the person's machine.
  const scratch = mkdtempSync(join(tmpdir(), 'volga-import-'));
  try {
    const path = join(scratch, 'incoming.db');
    writeFileSync(path, bytes, { mode: 0o600 });

    const source = openConnectionsStore({ path });
    try {
      if (options.includeCredentials) {
        // Unlocking is what proves the password; a wrong one throws here.
        source.unlock(options.sourcePassword);
      }
      const snapshot = buildSnapshot(source.snapshot(), {
        includePasswords: false,
        note: 'imported from another Volga store',
      });

      // Which records had a password is known before anything is decrypted, so
      // the report can say what was left behind when credentials are skipped.
      const credentialsAvailable = new Set(
        source
          .listConnections()
          .filter((connection) => connection.encryptedPassword !== null)
          .map((connection) => connection.id),
      );

      const passwords = new Map<string, string>();
      if (options.includeCredentials) {
        for (const id of credentialsAvailable) {
          passwords.set(id, source.resolvePassword(id));
        }
      }
      return { snapshot, passwords, credentialsAvailable };
    } finally {
      source.close();
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Reads the store's database as bytes.
 *
 * This is what "copy my connections to another machine" is. The bytes go to the
 * browser, and the browser writes them wherever the person chooses through the
 * file picker, so the destination is theirs to pick and this process never
 * touches it.
 *
 * The write-ahead log is folded into the file first, so the bytes are complete
 * on their own and the `-wal` and `-shm` companions are not needed beside them.
 */
export function exportStoreBytes(store: ConnectionsStore): Uint8Array {
  store.checkpoint();
  return readFileSync(store.path);
}

/**
 * Writes an snapshot into a store.
 *
 * Everything happens in one transaction, so a failure part-way leaves the store
 * exactly as it was. Names are the identity people see, so conflicts are
 * resolved by name rather than by id, which also makes an snapshot from another
 * machine behave sensibly.
 *
 * @throws {SnapshotError} when the store is locked and the snapshot carries
 * passwords that were asked to be kept.
 */
export function importSnapshot(
  store: ConnectionsStore,
  snapshot: Snapshot,
  options: ImportOptions = {},
): ImportReport {
  const conflict = options.conflict ?? 'skip';
  const keepPasswords = options.dropPasswords !== true;

  if (keepPasswords && options.targetPassword !== undefined) {
    store.unlock(options.targetPassword);
  }
  if (keepPasswords && !store.state().unlocked) {
    throw new SnapshotError(
      'The store must be unlocked before importing saved passwords. ' +
        'Unlock it, or import with passwords dropped.',
    );
  }

  const report = {
    folders: 0,
    environments: 0,
    connections: 0,
    skipped: [] as string[],
    renamed: [] as { from: string; to: string }[],
    replaced: [] as string[],
    passwordsImported: 0,
    passwordsDropped: 0,
  };

  // Existing names, kept current as records are added so two records in one
  // snapshot cannot collide with each other.
  const environmentNames = new Map(store.listEnvironments().map((item) => [item.name.toLowerCase(), item.id]));
  const connectionNames = new Map(store.listConnections().map((item) => [item.name.toLowerCase(), item.id]));
  const folderNames = new Map(store.listFolders().map((item) => [item.name.toLowerCase(), item.id]));

  /** Resolves a clash by applying the chosen strategy. */
  function resolve(
    desired: string,
    taken: Map<string, string>,
  ): { readonly name: string; readonly existingId: string | undefined } {
    const existing = taken.get(desired.toLowerCase());
    if (existing === undefined) {
      return { name: desired, existingId: undefined };
    }
    switch (conflict) {
      case 'skip':
        return { name: desired, existingId: existing };
      case 'replace':
        return { name: desired, existingId: existing };
      case 'rename': {
        let counter = 2;
        let candidate = `${desired} (${counter})`;
        while (taken.has(candidate.toLowerCase())) {
          counter += 1;
          candidate = `${desired} (${counter})`;
        }
        return { name: candidate, existingId: undefined };
      }
    }
  }

  // Folders first, parents before children, so a nested folder can reference
  // one that already exists.
  const folderIdMap = new Map<string, FolderId>();
  const orderedFolders = orderFoldersByDepth(snapshot.folders);
  for (const folder of orderedFolders) {
    const resolved = resolve(folder.name, folderNames);
    if (resolved.existingId !== undefined) {
      folderIdMap.set(folder.id, asFolderId(resolved.existingId));
      report.skipped.push(`folder ${folder.name}`);
      continue;
    }
    const parentId = folder.parentId === null ? null : folderIdMap.get(folder.parentId) ?? null;
    const saved = store.saveFolder({
      name: resolved.name,
      description: folder.description,
      parentId,
    });
    folderIdMap.set(folder.id, saved.id);
    folderNames.set(saved.name.toLowerCase(), saved.id);
    noteRename(report, folder.name, saved.name);
    report.folders += 1;
  }

  // Environments, so connections can point at them.
  const environmentIdMap = new Map<string, EnvironmentId>();
  for (const environment of snapshot.environments) {
    const resolved = resolve(environment.name, environmentNames);
    if (resolved.existingId !== undefined && conflict === 'skip') {
      environmentIdMap.set(environment.id, asEnvironmentId(resolved.existingId));
      report.skipped.push(`environment ${environment.name}`);
      continue;
    }
    const existing = resolved.existingId;
    const saved = store.saveEnvironment(
      {
        name: resolved.name,
        host: environment.endpoint.host,
        port: environment.endpoint.port,
        httpPort: environment.endpoint.httpPort,
        subjectPrefix: environment.endpoint.subjectPrefix,
        description: environment.description,
        folderId: environment.folderId === null ? null : folderIdMap.get(environment.folderId) ?? null,
        tagNames: environment.tags,
      },
      conflict === 'replace' && existing !== undefined ? asEnvironmentId(existing) : undefined,
    );
    environmentIdMap.set(environment.id, saved.id);
    environmentNames.set(saved.name.toLowerCase(), saved.id);
    if (conflict === 'replace' && existing !== undefined) {
      report.replaced.push(`environment ${environment.name}`);
    } else {
      noteRename(report, environment.name, saved.name);
      report.environments += 1;
    }
  }

  for (const connection of snapshot.connections) {
    const resolved = resolve(connection.name, connectionNames);
    if (resolved.existingId !== undefined && conflict === 'skip') {
      connectionIdName(report, connection.name);
      continue;
    }

    // A connection must keep pointing at the environment it named, remapped to
    // whatever id that environment received here.
    let target: ConnectionTarget;
    if (connection.target.kind === 'environment') {
      const mapped = environmentIdMap.get(connection.target.environmentId);
      if (mapped === undefined) {
        // The environment was filtered out of the snapshot, so the connection
        // has nowhere to point. Skipping it silently would lose data.
        throw new SnapshotError(
          `Connection ${connection.name} refers to environment ` +
            `${connection.target.environmentId}, which the snapshot does not contain`,
        );
      }
      target = { kind: 'environment', environmentId: mapped };
    } else {
      target = { kind: 'standalone', endpoint: connection.target.endpoint };
    }

    let password: string | undefined;
    // A caller that already decrypted the passwords supplies them directly,
    // which is how a whole-file import avoids decrypting twice.
    const supplied = options.passwords?.get(connection.id);
    if (supplied !== undefined && supplied.length > 0 && keepPasswords) {
      password = supplied;
      report.passwordsImported += 1;
    } else if (connection.encryptedPassword !== null && keepPasswords) {
      if (options.sourcePassword === undefined) {
        throw new SnapshotError(
          `Connection ${connection.name} carries a saved password; supply sourcePassword to keep it`,
        );
      }
      try {
        password = decryptSecret(
          connection.encryptedPassword as EncryptedSecret,
          options.sourcePassword,
        );
        report.passwordsImported += 1;
      } catch (cause) {
        throw new SnapshotError(
          `Could not decrypt the saved password for ${connection.name}. ` +
            'The source password does not match the snapshot.',
          { cause },
        );
      }
    } else if (
      connection.encryptedPassword !== null ||
      supplied !== undefined ||
      options.credentialsAvailable?.has(connection.id) === true
    ) {
      report.passwordsDropped += 1;
    }

    const existing = resolved.existingId;
    const saved = store.saveConnection(
      {
        name: resolved.name,
        target,
        username: connection.username,
        description: connection.description,
        folderId: connection.folderId === null ? null : folderIdMap.get(connection.folderId) ?? null,
        tagNames: connection.tags,
        ...(password === undefined ? {} : { password }),
      },
      conflict === 'replace' && existing !== undefined ? asConnectionId(existing) : undefined,
    );
    connectionNames.set(saved.name.toLowerCase(), saved.id);
    if (conflict === 'replace' && resolved.existingId !== undefined) {
      report.replaced.push(`connection ${connection.name}`);
    } else {
      report.connections += 1;
    }
  }

  return report;
}

function connectionIdName(report: { skipped: string[] }, name: string): void {
  report.skipped.push(`connection ${name}`);
}

/** Records a rename, so an import that changed names says so. */
function noteRename(
  report: { renamed: { from: string; to: string }[] },
  from: string,
  to: string,
): void {
  if (from !== to) {
    report.renamed.push({ from, to });
  }
}

/**
 * Sorts folders so a parent always precedes its children.
 *
 * An snapshot is a flat list, and a child cannot be inserted before its parent
 * exists. A cycle, which a hand-edited file could contain, is broken rather
 * than looped over.
 */
function orderFoldersByDepth<T extends { readonly id: string; readonly parentId: string | null }>(
  folders: readonly T[],
): readonly T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder] as const));
  const depth = new Map<string, number>();

  function computeDepth(id: string, seen: Set<string>): number {
    const cached = depth.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (seen.has(id)) {
      return 0;
    }
    seen.add(id);
    const folder = byId.get(id);
    const value =
      folder === undefined || folder.parentId === null ? 0 : computeDepth(folder.parentId, seen) + 1;
    depth.set(id, value);
    return value;
  }

  return [...folders].sort((left, right) => computeDepth(left.id, new Set()) - computeDepth(right.id, new Set()));
}

export { SNAPSHOT_KIND, SNAPSHOT_VERSION };
export type { Endpoint };
