/**
 * The browser-safe surface of the protocol package.
 *
 * The default entry point pulls in the NATS client and its transport, which
 * reach for Node built-ins. A browser must never load any of that, and the
 * browser also has no business opening a broker connection: the BFF owns it.
 * This entry point therefore re-exports only data, schemas, and limits, and
 * deliberately does not re-export the client, the transport, or the codec.
 */

// Data and schemas.
export {
  LIVE_WORKSPACE_ID,
  SYSTEM_TENANT_ID,
  fromWireTimestamp,
  isUuid,
  isWireTimestamp,
  toWireTimestamp,
  uuid,
  wireTimestamp,
} from './primitives.js';
export type { Uuid, WireTimestamp } from './primitives.js';

export {
  ACCOUNT_TYPES,
  accountPageSchema,
  accountSchema,
  activePartySchema,
  partySummarySchema,
} from './domain.js';
export type { Account, AccountPage, AccountType, ActiveParty, PartySummary } from './domain.js';

export {
  accountListSchema,
  apiErrorSchema,
  loginResultSchema,
  loginSuccessSchema,
  partyChoiceSchema,
  sessionViewSchema,
  sseEnvelopeSchema,
} from './contracts.js';
export type {
  AccountList,
  ApiError,
  LoginResult,
  LoginSuccess,
  PartyChoice,
  SessionView,
} from './contracts.js';

// Subjects, so a browser-side module can name one without importing the
// transport that would know how to reach it.
export { SUBJECTS } from './operations.js';
