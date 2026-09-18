import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { TlsMaterial } from '@volga/protocol';

/**
 * BFF configuration, read once at startup and validated.
 *
 * A missing or malformed value fails the process at boot rather than
 * surfacing as a confusing runtime error on the first login.
 */

const environmentSchema = z.object({
  /** Port the browser-facing HTTP server listens on. */
  VOLGA_BFF_PORT: z.coerce.number().int().positive().default(8080),
  VOLGA_BFF_HOST: z.string().default('127.0.0.1'),

  VOLGA_NATS_URL: z.string().default('nats://localhost:21805'),
  VOLGA_NATS_SUBJECT_PREFIX: z.string().min(1),
  VOLGA_NATS_WIRE_FORMAT: z.enum(['msgpack', 'json']).default('msgpack'),

  VOLGA_NATS_TLS_CA: z.string(),
  VOLGA_NATS_TLS_CERT: z.string(),
  VOLGA_NATS_TLS_KEY: z.string(),

  /** Secret for the session cookie. Required: a default would be a backdoor. */
  VOLGA_SESSION_SECRET: z.string().min(32),
  VOLGA_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(8 * 60 * 60),
  /**
   * `secure` cookies require HTTPS. Off by default so the development server
   * on plain HTTP works, and it must be on anywhere else.
   */
  VOLGA_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Login attempts allowed per client per minute.
   *
   * The IAM service counts failed attempts and locks an account, so this is
   * not the security boundary; it stops a runaway client from driving that
   * counter with unbounded traffic.
   */
  VOLGA_LOGIN_ATTEMPTS_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** Origins allowed to call the API, comma separated. */
  VOLGA_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
});

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly nats: {
    readonly url: string;
    readonly subjectPrefix: string;
    readonly format: 'msgpack' | 'json';
    readonly tls: TlsMaterial;
  };
  readonly session: {
    readonly secret: string;
    readonly ttlSeconds: number;
    readonly cookieSecure: boolean;
  };
  readonly allowedOrigins: readonly string[];
  readonly loginAttemptsPerMinute: number;
}

/** Reads configuration from the environment, or from `file` when given. */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;

  return {
    port: env.VOLGA_BFF_PORT,
    host: env.VOLGA_BFF_HOST,
    nats: {
      url: env.VOLGA_NATS_URL,
      subjectPrefix: env.VOLGA_NATS_SUBJECT_PREFIX,
      format: env.VOLGA_NATS_WIRE_FORMAT,
      tls: {
        ca: readPem(env.VOLGA_NATS_TLS_CA),
        cert: readPem(env.VOLGA_NATS_TLS_CERT),
        key: readPem(env.VOLGA_NATS_TLS_KEY),
      },
    },
    session: {
      secret: env.VOLGA_SESSION_SECRET,
      ttlSeconds: env.VOLGA_SESSION_TTL_SECONDS,
      cookieSecure: env.VOLGA_COOKIE_SECURE,
    },
    allowedOrigins: env.VOLGA_ALLOWED_ORIGINS,
    loginAttemptsPerMinute: env.VOLGA_LOGIN_ATTEMPTS_PER_MINUTE,
  };
}

/**
 * Reads certificate material.
 *
 * A value that names an existing file is read from disk; anything else is
 * treated as inline PEM, so a deployment can supply either.
 */
function readPem(value: string): string {
  if (value.includes('-----BEGIN')) {
    return value;
  }
  try {
    return readFileSync(value, 'utf8');
  } catch (cause) {
    throw new Error(`Cannot read certificate at ${value}`, { cause });
  }
}
