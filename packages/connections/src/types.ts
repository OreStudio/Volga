/**
 * The connections store's domain types.
 *
 * The shape mirrors the Qt client's store so an existing `connections.db` can
 * be migrated, but the modelling is TypeScript's: identifiers are branded so a
 * folder id cannot be passed where an environment id is wanted, and a
 * connection carries either an environment reference or its own endpoint, never
 * a half-populated mixture of the two.
 */

/**
 * Record keys.
 *
 * These are plain strings rather than branded types, and that is a deliberate
 * change from the first version. The store mints a uuid when it creates a
 * record, but it also reads records from a snapshot, which carries whatever
 * keys that snapshot used. Branding them would mean either rejecting a foreign
 * key or casting it, and a cast is exactly the false confidence the brand was
 * meant to prevent. The store validates the shape of a key at its boundary
 * instead.
 */
export type EnvironmentId = string;
export type ConnectionId = string;
export type FolderId = string;
export type TagId = string;

/**
 * Keys the store mints are uuids; keys read from a snapshot need only be a
 * usable token.
 */
const MINTED_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function assertMintedKey(value: string, label: string): string {
  if (!MINTED_KEY_PATTERN.test(value)) {
    throw new TypeError(`Not a ${label} key: ${JSON.stringify(value)}`);
  }
  return value;
}

export const environmentId = (value: string): EnvironmentId =>
  assertMintedKey(value, 'environment');
export const connectionId = (value: string): ConnectionId => assertMintedKey(value, 'connection');
export const folderId = (value: string): FolderId => assertMintedKey(value, 'folder');
export const tagId = (value: string): TagId => assertMintedKey(value, 'tag');

/** True for any key a store or a snapshot may legitimately use. */
export function isUsableKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/**
 * Where a server can be reached.
 *
 * Field names match the Qt store: `subject_prefix` is the NATS namespace that
 * isolates one environment from another sharing a broker.
 */
export interface Endpoint {
  readonly host: string;
  readonly port: number;
  /** NATS subject namespace, for example `ores.dev.local1`. Empty means none. */
  readonly subjectPrefix: string;
  /** Companion HTTP server port. */
  readonly httpPort: number;
}

/**
 * A named place to connect, with no credentials.
 *
 * Environments are the unit a person picks first, and a connection may point at
 * one so its endpoint is defined once rather than repeated.
 */
export interface Environment {
  readonly id: EnvironmentId;
  readonly folderId: FolderId | null;
  readonly name: string;
  readonly endpoint: Endpoint;
  readonly description: string;
  /** Tag names. A tag is meaningful by name, so ids stay inside the store. */
  readonly tags: readonly string[];
  /** When the record was last written, as an ISO 8601 instant. */
  readonly updatedAt: string;
}

/**
 * A set of credentials, optionally attached to an environment.
 *
 * The endpoint is either inherited from `environmentId` or stated directly.
 * That is the one place the Qt schema is loose, where both a link and stray
 * host and port columns can be set at once, and this models it as a choice.
 */
export type ConnectionTarget =
  | { readonly kind: 'environment'; readonly environmentId: EnvironmentId }
  | { readonly kind: 'standalone'; readonly endpoint: Endpoint };

export interface Connection {
  readonly id: ConnectionId;
  readonly folderId: FolderId | null;
  readonly name: string;
  readonly target: ConnectionTarget;
  readonly username: string;
  /**
   * The stored password, encrypted with the master password.
   *
   * Null when the person chose not to save one, in which case the sign-in
   * screen prompts for it every time.
   */
  readonly encryptedPassword: string | null;
  readonly description: string;
  /** Tag names. A tag is meaningful by name, so ids stay inside the store. */
  readonly tags: readonly string[];
  readonly updatedAt: string;
}

export interface Folder {
  readonly id: FolderId;
  readonly parentId: string | null;
  readonly name: string;
  readonly description: string;
}

export interface Tag {
  readonly id: TagId;
  readonly name: string;
}

/** Everything the store holds, read in one transaction. */
export interface ConnectionsSnapshot {
  readonly environments: readonly Environment[];
  readonly connections: readonly Connection[];
  readonly folders: readonly Folder[];
  readonly tags: readonly Tag[];
}

/**
 * A connection prepared for display, before any credential is decrypted.
 *
 * This is what crosses to the browser. It never contains a password, an
 * encrypted password, or a host that the browser is not entitled to know.
 */
export interface ConnectionSummary {
  readonly id: ConnectionId;
  readonly name: string;
  readonly username: string;
  readonly description: string;
  readonly folderId: FolderId | null;
  readonly tagNames: readonly string[];
  readonly environment:
    | { readonly kind: 'environment'; readonly id: EnvironmentId; readonly name: string }
    | { readonly kind: 'standalone'; readonly endpoint: Endpoint };
}

/** An environment prepared for display, with the connections that point at it. */
export interface EnvironmentSummary {
  readonly id: EnvironmentId;
  readonly name: string;
  readonly description: string;
  readonly endpoint: Endpoint;
  readonly folderId: FolderId | null;
  readonly tagNames: readonly string[];
}
