import { z } from 'zod';
import { accountSchema, activePartySchema, partySummarySchema } from './domain.js';

/**
 * The HTTP contract between the BFF and the browser.
 *
 * Both sides import these schemas, so the browser parses what the BFF sent
 * with the same definition the BFF serialised it from. That removes the usual
 * hand-written mirror of an API shape, which cannot be checked by the
 * compiler across a network boundary.
 *
 * The session never carries the bearer token. The browser holds an opaque
 * cookie instead, and the token stays on the server.
 */

/** The signed-in session as the browser sees it. */
export const sessionViewSchema = z.object({
  username: z.string(),
  email: z.string(),
  accountId: z.string(),
  tenantId: z.string(),
  tenantName: z.string(),
  party: partySummarySchema,
  availableParties: z.array(partySummarySchema),
  /** Seconds the token remains valid for, so the browser can renew early. */
  accessLifetimeSeconds: z.int().positive(),
  passwordResetRequired: z.boolean(),
});
export type SessionView = z.infer<typeof sessionViewSchema>;

/**
 * Returned when the credential was accepted but a party is still required.
 *
 * A distinct outcome rather than an error, because the next step is a normal
 * action rather than a failure to recover from.
 */
export const partyChoiceSchema = z.object({
  outcome: z.literal('party-required'),
  username: z.string(),
  email: z.string(),
  accountId: z.string(),
  tenantName: z.string(),
  availableParties: z.array(partySummarySchema),
  defaultPartyId: z.string().nullable(),
  passwordResetRequired: z.boolean(),
});
export type PartyChoice = z.infer<typeof partyChoiceSchema>;

export const loginSuccessSchema = z.object({
  outcome: z.literal('active'),
  session: sessionViewSchema,
});
export type LoginSuccess = z.infer<typeof loginSuccessSchema>;

/** The union a login attempt resolves to. */
export const loginResultSchema = z.discriminatedUnion('outcome', [
  loginSuccessSchema,
  partyChoiceSchema,
]);
export type LoginResult = z.infer<typeof loginResultSchema>;

export const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const selectPartyRequestSchema = z.object({
  partyId: z.string().min(1),
});
export type SelectPartyRequest = z.infer<typeof selectPartyRequestSchema>;

/** One page of accounts, as the accounts screen consumes it. */
export const accountListSchema = z.object({
  accounts: z.array(accountSchema),
  totalCount: z.int().nonnegative(),
});
export type AccountList = z.infer<typeof accountListSchema>;

/**
 * A failure the browser can show.
 *
 * `code` is the stable part a caller branches on; `message` is for a human and
 * may change.
 */
export const apiErrorSchema = z.object({
  code: z.enum([
    'invalid-credentials',
    'not-authenticated',
    'session-expired',
    'forbidden',
    'invalid-request',
    'upstream-unavailable',
    'upstream-timeout',
    'internal',
  ]),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** The account's active party, as the handover carries it. */
export { activePartySchema };

export const sseEnvelopeSchema = z.object({
  event: z.enum(['connected', 'party-changed', 'session-expired', 'account-changed']),
  data: z.unknown(),
});
export type SseEnvelope = z.infer<typeof sseEnvelopeSchema>;
