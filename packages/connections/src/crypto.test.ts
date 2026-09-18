import { describe, expect, it } from 'vitest';
import {
  DecryptionFailedError,
  createVerifier,
  decryptSecret,
  encryptSecret,
  verifyMasterPassword,
  type EncryptedSecret,
} from './crypto.js';

const MASTER = 'correct horse battery staple';

describe('encryptSecret and decryptSecret', () => {
  it('round-trips a password', () => {
    const blob = encryptSecret('hunter2', MASTER);
    expect(decryptSecret(blob, MASTER)).toBe('hunter2');
  });

  it('round-trips a password with unicode and punctuation', () => {
    const password = 'paßwörd-with:odd/chars and spaces';
    expect(decryptSecret(encryptSecret(password, MASTER), MASTER)).toBe(password);
  });

  it('round-trips an empty password as an empty value', () => {
    // A connection either saves a password or saves nothing. There is no
    // encrypted representation of "no password".
    expect(encryptSecret('', MASTER)).toBe('');
    expect(decryptSecret('' as EncryptedSecret, MASTER)).toBe('');
  });

  it('produces a different blob every time', () => {
    // A fresh salt and iv per record, so two connections saving the same
    // password are not visibly identical in the file.
    const first = encryptSecret('same', MASTER);
    const second = encryptSecret('same', MASTER);
    expect(first).not.toBe(second);
    expect(decryptSecret(first, MASTER)).toBe(decryptSecret(second, MASTER));
  });

  it('does not contain the plaintext', () => {
    const blob = encryptSecret('hunter2', MASTER);
    expect(Buffer.from(blob, 'base64').toString('latin1')).not.toContain('hunter2');
  });

  it('rejects the wrong master password', () => {
    const blob = encryptSecret('hunter2', MASTER);
    expect(() => decryptSecret(blob, 'not the password')).toThrow(DecryptionFailedError);
  });

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    // AES-GCM is authenticated, so a single flipped bit is a hard failure.
    const blob = encryptSecret('hunter2', MASTER);
    const raw = Buffer.from(blob, 'base64');
    const lastByte = raw.length - 1;
    raw.writeUInt8(raw.readUInt8(lastByte) ^ 0x01, lastByte);
    expect(() => decryptSecret(raw.toString('base64') as EncryptedSecret, MASTER)).toThrow(
      DecryptionFailedError,
    );
  });

  it('rejects a truncated record', () => {
    expect(() => decryptSecret('AAAA' as EncryptedSecret, MASTER)).toThrow(DecryptionFailedError);
  });

  it('rejects a record whose version it does not understand', () => {
    const blob = encryptSecret('hunter2', MASTER);
    const raw = Buffer.from(blob, 'base64');
    raw.writeUInt8(99, 0);
    expect(() => decryptSecret(raw.toString('base64') as EncryptedSecret, MASTER)).toThrow(
      /Unsupported record version/,
    );
  });
});

describe('the verifier', () => {
  it('accepts the master password it was created with', () => {
    expect(verifyMasterPassword(createVerifier(MASTER), MASTER)).toBe(true);
  });

  it('rejects any other password', () => {
    const verifier = createVerifier(MASTER);
    expect(verifyMasterPassword(verifier, 'wrong')).toBe(false);
    expect(verifyMasterPassword(verifier, '')).toBe(false);
    expect(verifyMasterPassword(verifier, `${MASTER} `)).toBe(false);
  });
});
