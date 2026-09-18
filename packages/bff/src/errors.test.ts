import { describe, expect, it } from 'vitest';
import {
  MalformedResponseError,
  NotAuthenticatedError,
  OperationFailedError,
  RequestTimeoutError,
  ServiceUnavailableError,
  SessionExpiredError,
  TransportError,
} from '@volga/protocol';
import { invalidCredentials, toHttpFailure } from './errors.js';

/**
 * The error mapping is what a browser actually sees, so each protocol failure
 * is asserted to land on the status and code the UI branches on. An
 * unrecognised error must become a 500 with a generic message, never a leak of
 * an internal detail.
 */
describe('toHttpFailure', () => {
  it('maps an ended session to 401 session-expired', () => {
    const failure = toHttpFailure(new SessionExpiredError('max_session_exceeded', 'x'));
    expect(failure.status).toBe(401);
    expect(failure.body.code).toBe('session-expired');
  });

  it('maps a missing session to 401 not-authenticated', () => {
    const failure = toHttpFailure(new NotAuthenticatedError('no session'));
    expect(failure.status).toBe(401);
    expect(failure.body.code).toBe('not-authenticated');
  });

  it('maps a slow server to 504', () => {
    const failure = toHttpFailure(new RequestTimeoutError('x', 30_000));
    expect(failure.status).toBe(504);
    expect(failure.body.code).toBe('upstream-timeout');
  });

  it('maps no responders to 503', () => {
    const failure = toHttpFailure(new ServiceUnavailableError('x'));
    expect(failure.status).toBe(503);
    expect(failure.body.code).toBe('upstream-unavailable');
  });

  it('maps a lost connection to 503', () => {
    const failure = toHttpFailure(new TransportError('connection lost'));
    expect(failure.status).toBe(503);
  });

  it('keeps an operation failure message, which the server wrote for a human', () => {
    const failure = toHttpFailure(new OperationFailedError('x', 'account is in use'));
    expect(failure.status).toBe(409);
    expect(failure.body.message).toBe('account is in use');
  });

  it('reports an unrecognised error as an opaque 500', () => {
    const failure = toHttpFailure(new MalformedResponseError('internal detail'));
    expect(failure.status).toBe(500);
    expect(failure.body.code).toBe('internal');
    // The internal message must not reach the browser.
    expect(failure.body.message).not.toContain('internal detail');
  });

  it('passes an existing failure through unchanged', () => {
    const original = invalidCredentials('nope');
    expect(toHttpFailure(original)).toBe(original);
  });
});
