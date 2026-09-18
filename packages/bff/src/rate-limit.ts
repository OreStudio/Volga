/**
 * A per-key rate limiter for the login route.
 *
 * The IAM service already counts failed attempts and locks an account, so this
 * is not the security boundary. It stops a stuck client or a trivial script
 * from driving that counter with unbounded traffic.
 */

export interface RateLimiter {
  /** True when the caller may proceed; false when it must wait. */
  allow(key: string): boolean;
  readonly trackedKeys: number;
}

export interface RateLimiterOptions {
  readonly maxAttempts: number;
  readonly windowSeconds: number;
  readonly now?: () => number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const attempts = new Map<string, number[]>();
  const windowMs = options.windowSeconds * 1000;
  const now = options.now ?? (() => Date.now());

  return {
    allow(key) {
      const timestamp = now();
      const recent = (attempts.get(key) ?? []).filter(
        (recordedAt) => timestamp - recordedAt < windowMs,
      );
      if (recent.length >= options.maxAttempts) {
        attempts.set(key, recent);
        return false;
      }
      recent.push(timestamp);
      attempts.set(key, recent);
      return true;
    },
    get trackedKeys() {
      return attempts.size;
    },
  };
}
