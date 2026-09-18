import {
  accountListSchema,
  apiErrorSchema,
  loginResultSchema,
  sessionViewSchema,
  type AccountList,
  type ApiError,
  type LoginResult,
  type SessionView,
} from '@volga/protocol/browser';

/**
 * The browser's HTTP client.
 *
 * Every response is parsed with the schema the BFF serialised it from, so a
 * shape change on the server fails here with a readable error instead of
 * surfacing later as an undefined field in a component. The browser never
 * sees msgpack, a wire field name, or the bearer token.
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

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

async function send(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      // The session cookie is HttpOnly and must ride along.
      credentials: 'same-origin',
      ...init,
    });
  } catch (cause) {
    throw new ApiFailure(0, {
      code: 'upstream-unavailable',
      message: 'Cannot reach the server.',
    });
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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiFailure(500, { code: 'internal', message: 'The server sent invalid JSON.' });
  }
}

/** Narrows an unknown payload, reporting a contract mismatch as such. */
function expect<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiFailure(500, {
      code: 'internal',
      message: 'The server sent an unexpected response.',
    });
  }
  return parsed.data;
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export const api = {
  async login(credentials: Credentials): Promise<LoginResult> {
    const payload = await send('/api/session', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(credentials),
    });
    return expect(loginResultSchema, payload);
  },

  async selectParty(partyId: string): Promise<SessionView> {
    const payload = await send('/api/session/party', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ partyId }),
    });
    return expect(sessionViewSchema, payload);
  },

  /** Returns null when no session is open, which is not an error. */
  async session(): Promise<SessionView | null> {
    try {
      const payload = await send('/api/session', { method: 'GET' });
      return expect(sessionViewSchema, payload);
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        return null;
      }
      throw error;
    }
  },

  async logout(): Promise<void> {
    await send('/api/session', { method: 'DELETE' });
  },

  async accounts(input: { readonly offset?: number; readonly limit?: number } = {}): Promise<AccountList> {
    const query = new URLSearchParams();
    if (input.offset !== undefined) {
      query.set('offset', String(input.offset));
    }
    if (input.limit !== undefined) {
      query.set('limit', String(input.limit));
    }
    const suffix = query.size === 0 ? '' : `?${query.toString()}`;
    const payload = await send(`/api/accounts${suffix}`, { method: 'GET' });
    return expect(accountListSchema, payload);
  },

  async setAccountLocked(accountId: string, locked: boolean): Promise<void> {
    await send(`/api/accounts/${accountId}/${locked ? 'lock' : 'unlock'}`, { method: 'POST' });
  },

  async deleteAccount(accountId: string): Promise<void> {
    await send(`/api/accounts/${accountId}`, { method: 'DELETE' });
  },
};
