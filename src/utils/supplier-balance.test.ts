import { describe, expect, it } from 'vitest';

import { outstandingForSupplier, sumOutstandingBySupplier } from './supplier-balance';

import type { GoodsInvoice } from '@/types/domain';

function invoice(supplierId: string, debtUsdCents: number): GoodsInvoice {
  return {
    id: `${supplierId}-${debtUsdCents}`,
    createdAt: '2026-08-23T00:00:00Z',
    updatedAt: '2026-08-23T00:00:00Z',
    supplierId,
    date: '2026-08-23',
    totalUsdCents: debtUsdCents + 1_000,
    paidCashUsdCents: 1_000,
    debtUsdCents,
  };
}

describe('sumOutstandingBySupplier', () => {
  it('returns an empty map for an empty list', () => {
    expect(sumOutstandingBySupplier([])).toEqual(new Map());
  });

  it('aggregates multiple invoices of the same supplier', () => {
    const result = sumOutstandingBySupplier([
      invoice('s1', 100),
      invoice('s1', 200),
      invoice('s1', 300),
    ]);
    expect(result).toEqual(new Map([['s1', 600]]));
  });

  it('partitions debts across multiple suppliers', () => {
    const result = sumOutstandingBySupplier([
      invoice('s1', 100),
      invoice('s2', 75),
      invoice('s1', 50),
    ]);
    expect(result).toEqual(
      new Map([
        ['s1', 150],
        ['s2', 75],
      ]),
    );
  });

  it('keeps fully-paid suppliers in the map with a 0 total', () => {
    const result = sumOutstandingBySupplier([invoice('s1', 0)]);
    expect(result.get('s1')).toBe(0);
  });
});

describe('outstandingForSupplier', () => {
  it('returns 0 for an unknown supplier or empty list', () => {
    expect(outstandingForSupplier([], 's9')).toBe(0);
    expect(outstandingForSupplier([invoice('s1', 100)], 's9')).toBe(0);
  });

  it('sums only the requested supplier’s invoices', () => {
    const invoices = [invoice('s1', 100), invoice('s2', 500), invoice('s1', 25)];
    expect(outstandingForSupplier(invoices, 's1')).toBe(125);
    expect(outstandingForSupplier(invoices, 's2')).toBe(500);
  });

  it('is independent of input order', () => {
    const forward = [
      invoice('s1', 10),
      invoice('s2', 20),
      invoice('s1', 30),
      invoice('s3', 40),
    ];
    const reversed = [...forward].reverse();
    expect(sumOutstandingBySupplier(reversed)).toEqual(sumOutstandingBySupplier(forward));
    expect(outstandingForSupplier(reversed, 's1')).toBe(outstandingForSupplier(forward, 's1'));
  });
});
