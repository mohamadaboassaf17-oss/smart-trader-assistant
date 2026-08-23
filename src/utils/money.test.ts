import { describe, expect, it } from 'vitest';

import {
  dayTotalUsdCents,
  formatAmount,
  formatDualCurrency,
  formatMoney,
  fromCents,
  localToUsdCents,
  toCents,
} from './money';

describe('toCents', () => {
  it('converts a number to integer cents', () => {
    expect(toCents(1)).toBe(100);
    expect(toCents(1.5)).toBe(150);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(0)).toBe(0);
  });

  it('converts a numeric string to integer cents', () => {
    expect(toCents('12.34')).toBe(1234);
    expect(toCents('0')).toBe(0);
    expect(toCents('  10.5  ')).toBe(1050);
  });

  it('rounds to the nearest cent', () => {
    expect(toCents(0.005)).toBe(1);
    expect(toCents(0.004)).toBe(0);
  });

  it('rejects empty / non-numeric / non-finite input', () => {
    expect(() => toCents('')).toThrow(RangeError);
    expect(() => toCents('abc')).toThrow(RangeError);
    expect(() => toCents(NaN)).toThrow(RangeError);
    expect(() => toCents(Infinity)).toThrow(RangeError);
  });
});

describe('fromCents', () => {
  it('returns a plain number', () => {
    expect(fromCents(100)).toBe(1);
    expect(fromCents(1234)).toBe(12.34);
    expect(fromCents(0)).toBe(0);
  });

  it('rejects non-integer input', () => {
    expect(() => fromCents(1.5)).toThrow(RangeError);
  });
});

describe('localToUsdCents', () => {
  it('divides local cents by the rate and rounds', () => {
    // 8_950_000 LBP (89,500 LBP) at 89,500 LBP/USD = 1 USD = 100 USD cents
    expect(localToUsdCents(8_950_000, 89_500)).toBe(100);
    expect(localToUsdCents(0, 89_500)).toBe(0);
  });

  it('rounds fractional USD to nearest cent', () => {
    // 100 LBP (10_000 cents) at 89_500 LBP/USD = 0.001117 USD = 0.1117 USD cents → 0
    expect(localToUsdCents(10_000, 89_500)).toBe(0);
    // 50_000 LBP (5_000_000 cents) at 89_500 = 0.5586 USD = 55.86 USD cents → 56
    expect(localToUsdCents(5_000_000, 89_500)).toBe(56);
  });

  it('rejects undefined and null rates like other invalid rates', () => {
    expect(() => localToUsdCents(100, undefined as unknown as number)).toThrow(RangeError);
    expect(() => localToUsdCents(100, null as unknown as number)).toThrow(RangeError);
    // Zero local cents do NOT bypass the rate guard.
    expect(() => localToUsdCents(0, 0)).toThrow(RangeError);
  });

  it('rounds exact half-cents up, toward positive infinity', () => {
    // Synthetic rate 100_000 LBP/USD: every 50_000 local cents == 0.5 USD cents.
    expect(localToUsdCents(50_000, 100_000)).toBe(1);
    expect(localToUsdCents(150_000, 100_000)).toBe(2);
    expect(localToUsdCents(250_000, 100_000)).toBe(3);
    // Negative halves round toward +infinity too: -0.5 → -0 (negative zero).
    expect(Object.is(localToUsdCents(-50_000, 100_000), -0)).toBe(true);
    // Just below the half stays down; just above goes up.
    expect(localToUsdCents(49_999, 100_000)).toBe(0);
    expect(localToUsdCents(50_001, 100_000)).toBe(1);
  });

  it('preserves MAX_SAFE_INTEGER-scale values within the safe range', () => {
    expect(localToUsdCents(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
    // (2^53 − 1) / 2 = 4_503_599_627_370_495.5 → rounds up to an exact integer.
    expect(localToUsdCents(Number.MAX_SAFE_INTEGER, 2)).toBe(4_503_599_627_370_496);
  });

  it('rejects invalid rate', () => {
    expect(() => localToUsdCents(100, 0)).toThrow(RangeError);
    expect(() => localToUsdCents(100, -1)).toThrow(RangeError);
    expect(() => localToUsdCents(100, NaN)).toThrow(RangeError);
  });
});

describe('dayTotalUsdCents', () => {
  it('sums USD cash and local-converted cash', () => {
    // 50 USD cash + 89,500 LBP @ 89,500 → 50 + 1 = 51 USD = 5_100 cents
    expect(dayTotalUsdCents(5_000, 8_950_000, 89_500)).toBe(5_100);
  });

  it('handles zero inputs', () => {
    expect(dayTotalUsdCents(0, 0, 89_500)).toBe(0);
    expect(dayTotalUsdCents(10_000, 0, 89_500)).toBe(10_000);
    expect(dayTotalUsdCents(0, 8_950_000, 89_500)).toBe(100);
  });

  it('propagates the missing-rate guard even for zero amounts', () => {
    expect(() => dayTotalUsdCents(0, 0, undefined as unknown as number)).toThrow(RangeError);
    expect(() => dayTotalUsdCents(0, 0, null as unknown as number)).toThrow(RangeError);
    expect(() => dayTotalUsdCents(0, 0, -89_500)).toThrow(RangeError);
  });

  it('stays exact while the total remains within MAX_SAFE_INTEGER', () => {
    const big = Number.MAX_SAFE_INTEGER - 100;
    expect(dayTotalUsdCents(big, 10_000, 10_000)).toBe(Number.MAX_SAFE_INTEGER - 99);
  });

  it('loses precision silently once past MAX_SAFE_INTEGER (boundary pinned)', () => {
    // True answer 9_007_199_254_740_993; IEEE-754 spacing above 2^53 is 2.
    // Callers own overflow risk past this boundary (see @/utils/goal-math).
    expect(dayTotalUsdCents(Number.MAX_SAFE_INTEGER, 600, 300)).toBe(9_007_199_254_740_992);
  });
});

describe('formatAmount', () => {
  it('formats with two decimal places (en-US)', () => {
    expect(formatAmount(123_456)).toBe('1,234.56');
    expect(formatAmount(0)).toBe('0.00');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatAmount(1.5)).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('uses the given currency', () => {
    expect(formatMoney(10_000, 'USD').replace(/\s/g, ' ')).toContain('100.00');
    expect(formatMoney(10_000, 'EUR')).toMatch(/€|EUR/);
  });
});

describe('formatDualCurrency', () => {
  it('renders both currencies separated by a slash (en-US digits)', () => {
    // Force en-US to avoid Arabic-Indic digits in the test assertion.
    const out = formatDualCurrency(10_000, 'LBP', 89_500, 'en-US');
    // 100 USD = 8_950_000 LBP
    expect(out).toContain('8,950,000');
    expect(out).toContain('100.00');
    expect(out).toContain('/');
  });

  it('renders local-currency-style amount for ar-LB by default', () => {
    const out = formatDualCurrency(10_000, 'LBP', 89_500);
    // Arabic-Indic digits: ٨٬٩٥٠٬٠٠٠
    expect(out).toMatch(/[\u0660-\u0669]/);
    expect(out).toContain('/');
  });

  it('handles zero gracefully', () => {
    const out = formatDualCurrency(0, 'LBP', 89_500, 'en-US');
    expect(out).toContain('0.00');
  });
});
