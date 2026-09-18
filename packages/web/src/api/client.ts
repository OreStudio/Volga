import {
  accountListSchema,
  loginResultSchema,
  sessionViewSchema,
  type AccountList,
  type LoginResult,
  type SessionView,
} from '@volga/protocol/browser';
import { ApiFailure, request } from './transport.js';

/**
 * The session and account calls.
 *
 * These run after a connection has been chosen and a credential accepted. The
 * browser holds an opaque cookie rather than a token, so it cannot decide
 * locally whether it is signed in and asks instead.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Where to connect, from the environment or connection the person chose. */
export interface LoginEndpoint {
  readonly server: string;
  readonly port: number;
  readonly subjectPrefix: string;
  /** Set when signing in with a saved connection, so its stored password is used. */
  readonly connectionId?: string;
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export const api = {
  async login(credentials: Credentials, endpoint: LoginEndpoint): Promise<LoginResult> {
    const payload = await request('/api/session', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        server: endpoint.server,
        port: endpoint.port,
        subjectPrefix: endpoint.subjectPrefix,
        connectionId: endpoint.connectionId ?? '',
      }),
    });
    return loginResultSchema.parse(payload);
  },

  async selectParty(partyId: string): Promise<SessionView> {
    const payload = await request('/api/session/party', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ partyId }),
    });
    return sessionViewSchema.parse(payload);
  },

  /** Returns null when no session is open, which is not an error. */
  async session(): Promise<SessionView | null> {
    try {
      return sessionViewSchema.parse(await request('/api/session', { method: 'GET' }));
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        return null;
      }
      throw error;
    }
  },

  async logout(): Promise<void> {
    await request('/api/session', { method: 'DELETE' });
  },

  async accounts(
    input: { readonly offset?: number; readonly limit?: number } = {},
  ): Promise<AccountList> {
    const query = new URLSearchParams();
    if (input.offset !== undefined) {
      query.set('offset', String(input.offset));
    }
    if (input.limit !== undefined) {
      query.set('limit', String(input.limit));
    }
    const suffix = query.size === 0 ? '' : `?${query.toString()}`;
    return accountListSchema.parse(await request(`/api/accounts${suffix}`, { method: 'GET' }));
  },

  async setAccountLocked(accountId: string, locked: boolean): Promise<void> {
    await request(`/api/accounts/${accountId}/${locked ? 'lock' : 'unlock'}`, { method: 'POST' });
  },

  async deleteAccount(accountId: string): Promise<void> {
    await request(`/api/accounts/${accountId}`, { method: 'DELETE' });
  },
};

export { ApiFailure };
