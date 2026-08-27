import { describe, expect, it } from 'vitest';

import { paidObligationAmountsForMonth } from '@/utils/paid-obligations';

import type { Obligation, ObligationPayment } from '@/types/domain';

const nowIso = new Date().toISOString();

function obligationRow(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'ob-1',
    createdAt: nowIso,
    updatedAt: nowIso,
    name: 'إيجار',
    amountUsdCents: 30_000,
    dueDay: 1,
    active: true,
    ...overrides,
  };
}

function paymentRow(overrides: Partial<ObligationPayment> = {}): ObligationPayment {
  return {
    id: 'pay-1',
    createdAt: nowIso,
    updatedAt: nowIso,
    obligationId: 'ob-1',
    month: '2026-08',
    status: 'pending',
    ...overrides,
  };
}

describe('paidObligationAmountsForMonth', () => {
  it('joins each PAID payment row to its parent obligation amount', () => {
    const obligations = [
      obligationRow({ id: 'ob-rent', amountUsdCents: 30_000 }),
      obligationRow({ id: 'ob-power', name: 'كهرباء', amountUsdCents: 10_000 }),
    ];
    const payments = [
      paymentRow({ id: 'p1', obligationId: 'ob-rent', status: 'paid' }),
      paymentRow({ id: 'p2', obligationId: 'ob-power', status: 'paid' }),
    ];
    expect(paidObligationAmountsForMonth(obligations, payments, '2026-08')).toEqual([
      30_000, 10_000,
    ]);
  });

  it('excludes pending rows and other months', () => {
    const payments = [
      paymentRow({ id: 'p1', status: 'pending' }),
      paymentRow({ id: 'p2', status: 'paid' }),
      paymentRow({ id: 'p3', month: '2026-07', status: 'paid' }),
    ];
    expect(paidObligationAmountsForMonth([obligationRow()], payments, '2026-08')).toEqual([30_000]);
  });

  it('skips payment rows whose parent obligation is missing or deleted', () => {
    const payments = [
      paymentRow({ id: 'orphan', obligationId: 'ghost-id', status: 'paid' }),
      paymentRow({ id: 'kept', status: 'paid' }),
    ];
    expect(paidObligationAmountsForMonth([obligationRow()], payments, '2026-08')).toEqual([30_000]);
  });

  it('returns [] for an empty month', () => {
    expect(paidObligationAmountsForMonth([], [], '2026-08')).toEqual([]);
  });
});
