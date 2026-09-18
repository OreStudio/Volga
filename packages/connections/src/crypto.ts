import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Encryption for saved connection passwords.
 *
 * A saved password is the one piece of genuinely sensitive data this store
 * holds, so it is encrypted at rest with a key derived from the user's master
 * password. Nothing else in the store is secret: environment names, hosts and
 * usernames are readable without unlocking, which is deliberate, because the
 * sign-in screen has to show somewhere to connect before anyone has identified
 * themselves.
 *
 * The format is self-describing so parameters can change without guessing at
 * what an old record was written with:
 *
 *   base64( version(1) || kdfId(1) || saltLen(1) || ivLen(1) || tagLen(1)
 *           || logN(1) || r(4, big endian)
 *           || salt || iv || tag || ciphertext )
 *
 * The header is authenticated indirectly: it is mixed into the key derivation
 * through the salt and the parameters, and any change to it makes the GCM tag
 * check fail.
 */

/** scrypt, the only KDF this version defines. */
const KDF_SCRYPT = 1;
const FORMAT_VERSION = 1;
const HEADER_BYTES = 10;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * scrypt cost. 2^15 with r=8 needs about 32 MiB and roughly 60 ms, which is
 * tolerable once per unlock and expensive enough to make an offline attack on
 * a stolen store pay for itself.
 */
const DEFAULT_LOG_N = 15;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

/** A password encrypted with the master password. */
export type EncryptedSecret = string & { readonly __brand: 'EncryptedSecret' };

export class DecryptionFailedError extends Error {
  constructor(message = 'The master password is incorrect', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DecryptionFailedError';
  }
}

export interface ScryptParameters {
  readonly logN: number;
  readonly r: number;
  readonly p: number;
}

export const DEFAULT_SCRYPT: ScryptParameters = {
  logN: DEFAULT_LOG_N,
  r: DEFAULT_R,
  p: DEFAULT_P,
};

function deriveKey(masterPassword: string, salt: Buffer, params: ScryptParameters): Buffer {
  const n = 2 ** params.logN;
  const needed = 128 * n * params.r;
  if (needed > MAX_MEMORY_BYTES) {
    throw new DecryptionFailedError(
      `scrypt parameters demand ${needed} bytes, above the ${MAX_MEMORY_BYTES} byte limit`,
    );
  }
  return scryptSync(masterPassword, salt, KEY_BYTES, {
    N: n,
    r: params.r,
    p: params.p,
    maxmem: Math.max(MAX_MEMORY_BYTES, needed * 2),
  });
}

/**
 * Encrypts a password.
 *
 * An empty password produces an empty string: a saved connection either holds
 * a password or holds nothing, and there is no encrypted representation of
 * "no password".
 */
export function encryptSecret(
  plaintext: string,
  masterPassword: string,
  params: ScryptParameters = DEFAULT_SCRYPT,
): EncryptedSecret {
  if (plaintext.length === 0) {
    return '' as EncryptedSecret;
  }

  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(masterPassword, salt, params);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt8(FORMAT_VERSION, 0);
  header.writeUInt8(KDF_SCRYPT, 1);
  header.writeUInt8(SALT_BYTES, 2);
  header.writeUInt8(IV_BYTES, 3);
  header.writeUInt8(TAG_BYTES, 4);
  header.writeUInt8(params.logN, 5);
  header.writeUInt32BE(params.r, 6);

  return Buffer.concat([header, salt, iv, tag, ciphertext]).toString('base64') as EncryptedSecret;
}

interface ParsedBlob {
  readonly params: ScryptParameters;
  readonly salt: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly ciphertext: Buffer;
}

function parseBlob(blob: string): ParsedBlob {
  const raw = Buffer.from(blob, 'base64');
  if (raw.length < HEADER_BYTES) {
    throw new DecryptionFailedError('The stored password is truncated');
  }

  const version = raw.readUInt8(0);
  if (version !== FORMAT_VERSION) {
    throw new DecryptionFailedError(`Unsupported record version ${version}`);
  }
  const kdf = raw.readUInt8(1);
  if (kdf !== KDF_SCRYPT) {
    throw new DecryptionFailedError(`Unsupported key derivation ${kdf}`);
  }

  const saltLength = raw.readUInt8(2);
  const ivLength = raw.readUInt8(3);
  const tagLength = raw.readUInt8(4);
  const logN = raw.readUInt8(5);
  const r = raw.readUInt32BE(6);

  if (saltLength === 0 || ivLength === 0 || tagLength === 0 || logN === 0 || r === 0) {
    throw new DecryptionFailedError('The stored password header is malformed');
  }

  const bodyStart = HEADER_BYTES;
  const bodyEnd = raw.length;
  const needed = saltLength + ivLength + tagLength;
  if (bodyEnd - bodyStart < needed) {
    throw new DecryptionFailedError('The stored password is shorter than its header claims');
  }

  return {
    params: { logN, r, p: DEFAULT_P },
    salt: raw.subarray(bodyStart, bodyStart + saltLength),
    iv: raw.subarray(bodyStart + saltLength, bodyStart + saltLength + ivLength),
    tag: raw.subarray(bodyStart + saltLength + ivLength, bodyStart + needed),
    ciphertext: raw.subarray(bodyStart + needed),
  };
}

/**
 * Decrypts a password.
 *
 * @throws {DecryptionFailedError} when the record is malformed, or the master
 * password is wrong. GCM is authenticated, so a wrong password fails the tag
 * check rather than returning plausible garbage.
 */
export function decryptSecret(blob: EncryptedSecret, masterPassword: string): string {
  if (blob.length === 0) {
    return '';
  }
  const parsed = parseBlob(blob);
  let key: Buffer;
  try {
    key = deriveKey(masterPassword, parsed.salt, parsed.params);
  } catch (cause) {
    throw new DecryptionFailedError('Could not derive a key from the master password', { cause });
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, parsed.iv);
    decipher.setAuthTag(parsed.tag);
    return Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]).toString('utf8');
  } catch (cause) {
    throw new DecryptionFailedError('The master password is incorrect', { cause });
  }
}

/**
 * A value whose only purpose is to be encrypted and stored, so a candidate
 * master password can be tested even when the store holds no saved passwords.
 */
const VERIFIER_PLAINTEXT = 'volga.connections.verifier.v1';

export interface Verifier {
  readonly encrypted: EncryptedSecret;
  /** Salt used only for the verifier, kept separate from record salts. */
  readonly createdAt: string;
}

/** Creates the verifier record written once when the store is initialised. */
export function createVerifier(masterPassword: string): Verifier {
  return {
    encrypted: encryptSecret(VERIFIER_PLAINTEXT, masterPassword),
    createdAt: new Date().toISOString(),
  };
}

/** Constant-time check that a master password matches the verifier. */
export function verifyMasterPassword(verifier: Verifier, masterPassword: string): boolean {
  let decrypted: string;
  try {
    decrypted = decryptSecret(verifier.encrypted, masterPassword);
  } catch {
    return false;
  }
  const expected = Buffer.from(VERIFIER_PLAINTEXT, 'utf8');
  const actual = Buffer.from(decrypted, 'utf8');
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
