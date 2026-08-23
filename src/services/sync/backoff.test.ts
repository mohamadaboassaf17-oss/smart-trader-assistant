import { describe, expect, it } from 'vitest';

import { computeBackoffMs } from './backoff';

describe('computeBackoffMs', () => {
  it('doubles exponentially with no jitter', () => {
    const opts = { base: 1000, cap: 60_000, jitter: 0 };
    expect(computeBackoffMs(0, opts)).toBe(1_000);
    expect(computeBackoffMs(1, opts)).toBe(2_000);
    expect(computeBackoffMs(2, opts)).toBe(4_000);
    expect(computeBackoffMs(5, opts)).toBe(32_000);
  });

  it('clamps at the cap', () => {
    const opts = { base: 1000, cap: 10_000, jitter: 0 };
    expect(computeBackoffMs(4, opts)).toBe(10_000);
    expect(computeBackoffMs(20, opts)).toBe(10_000);
  });

  it('jitter stays within ±jitter × delay', () => {
    const opts = { base: 1000, cap: 60_000, jitter: 0.2 };
    const rng = (): number => 0.5; // midpoint → exactly raw delay
    expect(computeBackoffMs(0, opts, rng)).toBe(1_000);
    const low = computeBackoffMs(1, opts, () => 0);
    const high = computeBackoffMs(1, opts, () => 1);
    expect(low).toBeGreaterThanOrEqual(1_600);
    expect(low).toBeLessThanOrEqual(2_000);
    expect(high).toBeLessThanOrEqual(2_400);
    expect(high).toBeGreaterThanOrEqual(2_000);
  });

  it('guards huge retry counts against overflow', () => {
    const opts = { base: 1000, cap: 60_000, jitter: 0 };
    expect(Number.isFinite(computeBackoffMs(500, opts))).toBe(true);
  });
});
