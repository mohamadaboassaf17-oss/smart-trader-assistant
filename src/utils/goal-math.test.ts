import { describe, expect, it } from 'vitest';

import {
  daysRemainingInMonth,
  monthlyNetUsdCents,
  remainingToTargetUsdCents,
  requiredPerDayUsdCents,
} from './goal-math';

describe('monthlyNetUsdCents', () => {
  it('returns 0 for empty arrays', () => {
    expect(monthlyNetUsdCents([], [])).toBe(0);
  });

  it('sums single items on either side', () => {
    expect(monthlyNetUsdCents([500], [])).toBe(500);
    expect(monthlyNetUsdCents([], [300])).toBe(-300);
  });

  it('never clamps a losing month', () => {
    expect(monthlyNetUsdCents([100], [700])).toBe(-600);
  });

  it('sums mixed magnitudes across both sides', () => {
    expect(monthlyNetUsdCents([1_000, 250, 30], [80, 5])).toBe(1_195);
  });

  it('rejects non-integer cents', () => {
    expect(() => monthlyNetUsdCents([1.5], [])).toThrow(RangeError);
    expect(() => monthlyNetUsdCents([], [0.5])).toThrow(RangeError);
  });
});

describe('remainingToTargetUsdCents', () => {
  it('returns 0 when the target is met', () => {
    expect(remainingToTargetUsdCents(500, 500)).toBe(0);
  });

  it('returns 0 when the target is exceeded', () => {
    expect(remainingToTargetUsdCents(500, 600)).toBe(0);
  });

  it('returns the plain gap below target', () => {
    expect(remainingToTargetUsdCents(500, 200)).toBe(300);
  });

  it('widens the gap for negative net instead of clamping', () => {
    expect(remainingToTargetUsdCents(500, -300)).toBe(800);
  });
});

describe('requiredPerDayUsdCents', () => {
  it('rounds up so the trader never falls short', () => {
    expect(requiredPerDayUsdCents(100, 3)).toBe(34); // 33.33 → 34
    expect(requiredPerDayUsdCents(101, 3)).toBe(34); // 33.67 → 34
  });

  it('returns the exact quotient when division is clean', () => {
    expect(requiredPerDayUsdCents(90, 3)).toBe(30);
  });

  it('clamps to 0 when nothing remains (target met or exceeded)', () => {
    expect(requiredPerDayUsdCents(0, 5)).toBe(0);
    expect(requiredPerDayUsdCents(-500, 5)).toBe(0);
  });

  it('throws RangeError for daysRemaining < 1 or fractional', () => {
    expect(() => requiredPerDayUsdCents(100, 0)).toThrow(RangeError);
    expect(() => requiredPerDayUsdCents(100, -1)).toThrow(RangeError);
    expect(() => requiredPerDayUsdCents(100, 1.5)).toThrow(RangeError);
  });
});

describe('daysRemainingInMonth', () => {
  it('counts the reference day itself on the first of the month', () => {
    expect(daysRemainingInMonth('2026-08-01')).toBe(31);
    expect(daysRemainingInMonth('2026-04-01')).toBe(30);
  });

  it('returns 1 on the last day of the month', () => {
    expect(daysRemainingInMonth('2026-08-31')).toBe(1);
    expect(daysRemainingInMonth('2026-04-30')).toBe(1);
  });

  it('is leap-year aware for February', () => {
    expect(daysRemainingInMonth('2024-02-01')).toBe(29);
    expect(daysRemainingInMonth('2024-02-29')).toBe(1);
    expect(daysRemainingInMonth('2025-02-01')).toBe(28);
    // Century rule: 1900 is not a leap year, 2000 is.
    expect(daysRemainingInMonth('1900-02-01')).toBe(28);
    expect(daysRemainingInMonth('2000-02-01')).toBe(29);
  });

  it('accepts a Date instance', () => {
    expect(daysRemainingInMonth(new Date(2026, 7, 15))).toBe(17);
  });

  it('throws RangeError for malformed ISO strings', () => {
    expect(() => daysRemainingInMonth('')).toThrow(RangeError);
    expect(() => daysRemainingInMonth('2026/08/15')).toThrow(RangeError);
    expect(() => daysRemainingInMonth('2026-8-5')).toThrow(RangeError);
  });

  it('throws RangeError for impossible calendar dates', () => {
    expect(() => daysRemainingInMonth('2026-02-30')).toThrow(RangeError);
    expect(() => daysRemainingInMonth('2026-13-01')).toThrow(RangeError);
  });

  it('throws RangeError for invalid Date instances', () => {
    expect(() => daysRemainingInMonth(new Date('not-a-date'))).toThrow(RangeError);
  });
});
