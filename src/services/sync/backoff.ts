/**
 * Exponential backoff for the sync queue.
 *
 * delay = min(cap, base * 2^retryCount) with optional ±jitter so many
 * devices don't retry in lockstep. Deterministic when `jitter` is 0 or a
 * seeded rng is injected (tests).
 */

export interface BackoffOptions {
  /** Delay for the first retry, ms. */
  base?: number;
  /** Upper bound, ms. */
  cap?: number;
  /** 0..1 fraction; delay varies by ±(jitter * delay). */
  jitter?: number;
}

export const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  base: 1_000,
  cap: 60_000,
  jitter: 0.2,
};

export function computeBackoffMs(
  retryCount: number,
  options: BackoffOptions = {},
  rng: () => number = Math.random,
): number {
  const { base, cap, jitter } = { ...DEFAULT_BACKOFF, ...options };
  const exp = Math.min(retryCount, 30); // guard overflow
  const raw = Math.min(cap, base * 2 ** exp);
  if (jitter <= 0) return raw;
  const delta = raw * jitter;
  return Math.round(raw - delta + rng() * delta * 2);
}
