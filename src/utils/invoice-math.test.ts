import { describe, expect, it } from 'vitest';

import { err, ok } from '@/types/result';

import { computeDebtUsdCents } from './invoice-math';

describe('computeDebtUsdCents', () => {
  it('returns the remaining debt for a partial cash payment', () => {
    expect(computeDebtUsdCents(100_000, 40_000)).toStrictEqual(ok(60_000));
  });

  it('returns 0 for a fully-paid invoice', () => {
    expect(computeDebtUsdCents(50_000, 50_000)).toStrictEqual(ok(0));
  });

  it('returns 0 for zero total and zero paid', () => {
    expect(computeDebtUsdCents(0, 0)).toStrictEqual(ok(0));
  });

  it('treats paid == total as fully paid, not overpay', () => {
    expect(computeDebtUsdCents(1, 1)).toStrictEqual(ok(0));
  });

  it('handles huge-but-safe cent amounts exactly', () => {
    expect(computeDebtUsdCents(999_999_999, 999_999_998)).toStrictEqual(ok(1));
    expect(computeDebtUsdCents(999_999_999, 400_000_000)).toStrictEqual(ok(599_999_999));
  });

  it('rejects payment exceeding the total as overpay', () => {
    expect(computeDebtUsdCents(100, 101)).toStrictEqual(err({ kind: 'overpay' }));
  });

  it('rejects a negative total', () => {
    expect(computeDebtUsdCents(-1, 0)).toStrictEqual(err({ kind: 'negativeTotal' }));
  });

  it('rejects a negative cash portion', () => {
    expect(computeDebtUsdCents(100, -1)).toStrictEqual(err({ kind: 'negativePaid' }));
  });

  it('rejects fractional cents on either argument', () => {
    expect(computeDebtUsdCents(100.5, 0)).toStrictEqual(err({ kind: 'nonIntegerCents' }));
    expect(computeDebtUsdCents(100, 0.25)).toStrictEqual(err({ kind: 'nonIntegerCents' }));
  });

  it('reports non-finite inputs as non-integer cents', () => {
    expect(computeDebtUsdCents(Number.NaN, 0)).toStrictEqual(err({ kind: 'nonIntegerCents' }));
    expect(computeDebtUsdCents(100, Number.POSITIVE_INFINITY)).toStrictEqual(
      err({ kind: 'nonIntegerCents' }),
    );
  });
});
