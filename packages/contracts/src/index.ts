/**
 * `@volga/contracts` holds the HTTP shapes the BFF and the browser agree on.
 *
 * Both sides import the same schema, so the browser validates what the server
 * serialised with the definition the server serialised it from. That is the
 * only way a network boundary gets checked without a code generator, and it
 * means a shape change fails loudly on whichever side is stale.
 */
export * from './connections.js';
