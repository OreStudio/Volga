import { apiErrorSchema, type ApiError } from '@volga/protocol/browser';

/**
 * The browser's transport.
 *
 * One place decides how a request is made and how a failure is turned into
 * something a component can show. Every response is parsed with a schema at the
 * call site, so this layer only deals with the mechanics.
 *
 * Note what a request can carry: an identity, and nothing about where the
 * application connects. That is fixed by the deployment.
 */

/** A failure the UI can present, already narrowed from the error contract. */
export class ApiFailure extends Error {
  readonly code: ApiError['code'];
  readonly status: number;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ApiFailure';
    this.code = body.code;
    this.status = status;
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiFailure(500, { code: 'internal', message: 'The server sent invalid JSON.' });
  }
}

/** Sends a request and returns the decoded body, or throws an {@link ApiFailure}. */
export async function request(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      // The session cookie is HttpOnly and must ride along.
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    throw new ApiFailure(0, { code: 'upstream-unavailable', message: 'Cannot reach the server.' });
  }

  const text = await response.text();
  const payload: unknown = text.length === 0 ? null : parseJson(text);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new ApiFailure(
      response.status,
      parsed.success
        ? parsed.data
        : { code: 'internal', message: `Request failed with status ${response.status}` },
    );
  }
  return payload;
}
