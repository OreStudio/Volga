import { z } from 'zod';

/**
 * The HTTP contract for signing in and for the account screens.
 *
 * Small on purpose. The environment is deployment configuration, so a sign-in
 * carries an identity and nothing else. There is no server, port, namespace or
 * saved connection here, and there should never be one: a browser that can
 * name a host can ask the server to connect to it.
 */

export const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const selectPartySchema = z.object({
  partyId: z.string().min(1),
});
export type SelectPartyRequest = z.infer<typeof selectPartySchema>;
