import { describe, expect, it } from 'vitest';

import {
  dashboardNetUsdCents,
  grossSalesUsdCents,
  paidObligationsTotalUsdCents,
  sidePurchasesTotalUsdCents,
} from './dashboard-math';

describe('grossSalesUsdCents', () => {
  it('sums the month sale totals', () => {
    expect(grossSalesUsdCents([1_000, 250, 30])).toBe(1_280);
  });

  it('returns 0 for an empty month', () => {
    expect(grossSalesUsdCents([])).toBe(0);
  });

  it('rejects non-integer cents', () => {
    expect(() => grossSalesUsdCents([1.5])).toThrow(RangeError);
  });
});

describe('sidePurchasesTotalUsdCents', () => {
  it('sums the month side purchases', () => {
    expect(sidePurchasesTotalUsdCents([80, 5])).toBe(85);
  });

  it('returns 0 for an empty month', () => {
    expect(sidePurchasesTotalUsdCents([])).toBe(0);
  });

  it('rejects non-integer cents', () => {
    expect(() => sidePurchasesTotalUsdCents([0.5])).toThrow(RangeError);
  });
});

describe('paidObligationsTotalUsdCents', () => {
  it('sums the month paid obligations', () => {
    expect(paidObligationsTotalUsdCents([150, 400])).toBe(550);
  });

  it('returns 0 for an empty month', () => {
    expect(paidObligationsTotalUsdCents([])).toBe(0);
  });

  it('rejects non-integer cents', () => {
    expect(() => paidObligationsTotalUsdCents([2.25])).toThrow(RangeError);
  });
});

describe('dashboardNetUsdCents', () => {
  it('applies the PRD §6.6 formula across all three components', () => {
    // Σsales − Σpurchases − Σobligations = 3_000 − 500 − 250 = 2_250
    expect(dashboardNetUsdCents([2_800, 200], [300, 200], [100, 150])).toBe(2_250);
  });

  it('returns 0 for a completely empty month', () => {
    expect(dashboardNetUsdCents([], [], [])).toBe(0);
  });

  it('never clamps a losing month', () => {
    expect(dashboardNetUsdCents([100], [700], [50])).toBe(-650);
  });

  it('handles mixed magnitudes in a single pass', () => {
    // 9_999_999 + 1 − 499_999 − (123_456 + 65_535) = 9_311_010
    expect(dashboardNetUsdCents([9_999_999, 1], [499_999], [123_456, 65_535])).toBe(9_311_010);
  });

  it('rejects non-integer cents on any input array', () => {
    expect(() => dashboardNetUsdCents([1.5], [], [])).toThrow(RangeError);
    expect(() => dashboardNetUsdCents([], [0.5], [])).toThrow(RangeError);
    expect(() => dashboardNetUsdCents([], [], [1.25])).toThrow(RangeError);
  });
});
