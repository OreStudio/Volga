import { ConnectionsStoreError } from './store.js';

/**
 * Reading rows out of SQLite.
 *
 * `node:sqlite` hands back `Record<string, SQLOutputValue>`, which is honest:
 * the value type is whatever the storage engine held. Casting it to an
 * interface would be a claim nobody checked, so every column is read through
 * one of these helpers instead. A wrong or missing column fails here with the
 * column named, rather than surfacing later as `undefined` in the interface.
 */

export type Row = Record<string, unknown>;

function fail(column: string, expected: string, actual: unknown): never {
  throw new ConnectionsStoreError(
    `Column ${column} should be ${expected} but was ${actual === null ? 'null' : typeof actual}`,
  );
}

export function readString(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    fail(column, 'a string', value);
  }
  return value;
}

/** A column the schema allows to be null. */
export function readNullableString(row: Row, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    fail(column, 'a string or null', value);
  }
  return value;
}

export function readInteger(row: Row, column: string): number {
  const value = row[column];
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(column, 'an integer', value);
  }
  return value;
}

/** A count that SQLite may report as a bigint. */
export function readCount(row: Row | undefined, column: string): number {
  if (row === undefined) {
    return 0;
  }
  return readInteger(row, column);
}
