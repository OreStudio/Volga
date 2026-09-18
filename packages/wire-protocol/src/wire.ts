/**
 * The wire layer, split by concern.
 *
 * `operations` is the session protocol — login, logout, refresh, parties. The
 * `entities` directory holds one file per entity, each declaring the shape the
 * service speaks and the shape the interface uses. That split is what the code
 * generator will follow: one file per entity, in the same place.
 */
export * from './operations.js';
export * from './entities/index.js';
