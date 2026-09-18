import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

describe('createRateLimiter', () => {
  it('allows attempts up to the budget', () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowSeconds: 60, now: () => 0 });
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a')]).toEqual([true, true, true]);
    expect(limiter.allow('a')).toBe(false);
  });

  it('tracks callers independently', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowSeconds: 60, now: () => 0 });
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('b')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
  });

  it('forgets attempts once the window has passed', () => {
    let clock = 0;
    const limiter = createRateLimiter({ maxAttempts: 1, windowSeconds: 60, now: () => clock });
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    clock = 61_000;
    expect(limiter.allow('a')).toBe(true);
  });

  it('does not grow the map for a caller that keeps trying', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowSeconds: 60, now: () => 0 });
    for (let attempt = 0; attempt < 50; attempt += 1) {
      limiter.allow('a');
    }
    expect(limiter.trackedKeys).toBe(1);
  });
});
