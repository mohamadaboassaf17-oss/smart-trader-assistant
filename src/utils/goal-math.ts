/**
 * Goal-progress domain math (Goals feature, consumed by `<GoalAdvisor>`).
 *
 * Pure functions over **integer USD cents** — same canonical-currency
 * discipline as `@/utils/money` (PRD §6.1). Never floats in or out.
 *
 * Safe-range assumption: every input and every running sum stays within
 * `Number.MAX_SAFE_INTEGER` (about ±$90 trillion), orders of magnitude
 * beyond any real shop's monthly volume. BigInt is deliberately not
 * introduced; callers feeding values past that range own the overflow risk.
 *
 * Net definition (locked by product owner): `net = sales − side purchases`
 * ONLY. Obligations land in M6 and will extend `monthlyNetUsdCents`.
 */

interface CalendarParts {
  /** Four-digit year. */
  year: number;
  /** Zero-based month index (0–11), as `Date` expects. */
  monthIndex: number;
  /** Day of month (1–31). */
  day: number;
}

function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${label}: expected integer cents`);
}

/**
 * Monthly net in USD cents: `Σ sales − Σ side purchases`.
 *
 * Negative results are legitimate (a losing month) and are never clamped.
 * Inputs are treated as readonly and are not mutated; empty arrays
 * contribute 0, so `([], []) → 0`.
 */
export function monthlyNetUsdCents(
  saleTotalUsdCents: readonly number[],
  sidePurchaseUsdCents: readonly number[],
): number {
  let net = 0;
  for (const cents of saleTotalUsdCents) {
    assertCents(cents, 'monthlyNetUsdCents: sale total');
    net += cents;
  }
  for (const cents of sidePurchaseUsdCents) {
    assertCents(cents, 'monthlyNetUsdCents: side purchase');
    net -= cents;
  }
  return net;
}

/**
 * USD cents still needed to reach the monthly target given the net so far.
 * Returns 0 once the target is met or exceeded; a negative `netUsdCents`
 * widens the gap rather than clamping.
 */
export function remainingToTargetUsdCents(targetUsdCents: number, netUsdCents: number): number {
  assertCents(targetUsdCents, 'remainingToTargetUsdCents: target');
  assertCents(netUsdCents, 'remainingToTargetUsdCents: net');
  return Math.max(0, targetUsdCents - netUsdCents);
}

/**
 * Required average USD cents per remaining day to close the gap.
 *
 * Rounds **up** so the trader never falls short, and clamps to 0 when
 * `remainingUsdCents` is 0 or negative (target already met).
 * `daysRemaining` must be a whole number ≥ 1 — the divisor is validated,
 * never merely assumed non-zero.
 */
export function requiredPerDayUsdCents(remainingUsdCents: number, daysRemaining: number): number {
  assertCents(remainingUsdCents, 'requiredPerDayUsdCents: remaining');
  if (!Number.isInteger(daysRemaining) || daysRemaining < 1)
    throw new RangeError('requiredPerDayUsdCents: daysRemaining must be an integer >= 1');
  const remaining = Math.max(0, remainingUsdCents);
  if (remaining === 0) return 0;
  return Math.ceil(remaining / daysRemaining);
}

/**
 * Calendar days left in the reference date's month, counting the reference
 * day itself — always ≥ 1. Month-length aware (28/29/30/31, leap years).
 *
 * Accepts the domain date format `YYYY-MM-DD` or a `Date`. Throws
 * `RangeError` for malformed strings, impossible dates (e.g. `2024-02-30`),
 * or invalid `Date` instances.
 */
export function daysRemainingInMonth(reference: string | Date): number {
  const { year, monthIndex, day } = parseCalendarParts(reference);
  const monthLength = new Date(year, monthIndex + 1, 0).getDate();
  return monthLength - day + 1;
}

function parseCalendarParts(reference: string | Date): CalendarParts {
  if (reference instanceof Date) {
    if (Number.isNaN(reference.getTime()))
      throw new RangeError('daysRemainingInMonth: invalid Date');
    return {
      year: reference.getFullYear(),
      monthIndex: reference.getMonth(),
      day: reference.getDate(),
    };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reference);
  if (match === null)
    throw new RangeError(`daysRemainingInMonth: expected YYYY-MM-DD, got "${reference}"`);
  const [rawYear, rawMonth, rawDay] = match.slice(1);
  if (rawYear === undefined || rawMonth === undefined || rawDay === undefined)
    throw new RangeError(`daysRemainingInMonth: malformed date "${reference}"`);
  const year = Number(rawYear);
  const monthIndex = Number(rawMonth) - 1;
  const day = Number(rawDay);
  const probe = new Date(year, monthIndex, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== monthIndex || probe.getDate() !== day)
    throw new RangeError(`daysRemainingInMonth: not a real calendar date "${reference}"`);
  return { year, monthIndex, day };
}
