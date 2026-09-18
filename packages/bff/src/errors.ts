import {
  NotAuthenticatedError,
  OperationFailedError,
  RequestTimeoutError,
  ServerError,
  ServiceUnavailableError,
  SessionExpiredError,
  TransportError,
} from '@volga/protocol';
import type { ApiError } from '@volga/protocol';

/**
 * Maps an internal failure onto the browser-facing error contract.
 *
 * The mapping lives in one place so every route reports the same way, and so
 * a protocol error type added later cannot silently become a 500. Anything
 * unrecognised is a genuine bug and is reported as `internal`, with the real
 * error logged rather than sent to the browser.
 */

export class HttpFailure extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'HttpFailure';
    this.status = status;
    this.body = body;
  }
}

export function notAuthenticated(): HttpFailure {
  return new HttpFailure(401, {
    code: 'not-authenticated',
    message: 'Sign in to continue.',
  });
}

export function invalidCredentials(message: string): HttpFailure {
  return new HttpFailure(401, {
    code: 'invalid-credentials',
    message: message.length > 0 ? message : 'Invalid username or password.',
  });
}

export function invalidRequest(message: string): HttpFailure {
  return new HttpFailure(400, { code: 'invalid-request', message });
}

/**
 * Translates any thrown value into an {@link HttpFailure}.
 *
 * Returns the original failure when it already is one, so a route can throw a
 * specific status and have it preserved.
 */
export function toHttpFailure(error: unknown): HttpFailure {
  if (error instanceof HttpFailure) {
    return error;
  }
  if (error instanceof SessionExpiredError) {
    return new HttpFailure(401, {
      code: 'session-expired',
      message: 'Your session has ended. Sign in again.',
    });
  }
  if (error instanceof NotAuthenticatedError) {
    return notAuthenticated();
  }
  if (error instanceof ServerError) {
    return error.code === 'forbidden'
      ? new HttpFailure(403, { code: 'forbidden', message: 'You do not have access to this.' })
      : new HttpFailure(502, { code: 'upstream-unavailable', message: 'The server refused the request.' });
  }
  if (error instanceof OperationFailedError) {
    return new HttpFailure(409, { code: 'invalid-request', message: error.message });
  }
  if (error instanceof RequestTimeoutError) {
    return new HttpFailure(504, {
      code: 'upstream-timeout',
      message: 'The server did not answer in time.',
    });
  }
  if (error instanceof ServiceUnavailableError) {
    return new HttpFailure(503, {
      code: 'upstream-unavailable',
      message: 'That service is not running.',
    });
  }
  if (error instanceof TransportError) {
    return new HttpFailure(503, {
      code: 'upstream-unavailable',
      message: 'Cannot reach the message bus.',
    });
  }
  return new HttpFailure(500, {
    code: 'internal',
    message: 'Something went wrong.',
  });
}
