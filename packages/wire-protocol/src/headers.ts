import type { RequestHeaders } from './transport.js';

/**
 * A source of request headers.
 *
 * Passing a function keeps a caller's header values current across a refresh
 * without the caller having to rebuild them, which matters for the
 * `Nats-Session-Id` and `Nats-Correlation-Id` values that must stay stable for
 * a whole operation.
 */
export type HeaderSource = RequestHeaders | (() => RequestHeaders);

/** Reads a header source into a plain record. */
export function resolveHeaders(source: HeaderSource | undefined): RequestHeaders {
  if (source === undefined) {
    return {};
  }
  return typeof source === 'function' ? source() : source;
}
