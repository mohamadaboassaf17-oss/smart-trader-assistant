import { describe, expect, it } from 'vitest';

import { currentMonthKey, isValidMonthKey, pendingPaymentsForMonth } from './obligation-schedule';

import type { Obligation } from '@/types/domain';

/** Minimal full row so the `dueDay`-is-display-only case can be exercised. */
function obligation(id: string, active = true, dueDay = 1): Obligation {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: `Obligation ${id}`,
    amountUsdCents: 100_00,
    dueDay,
    active,
  };
}

describe('isValidMonthKey', () => {
  it('accepts zero-padded YYYY-MM keys', () => {
    expect(isValidMonthKey('2026-08')).toBe(true);
    expect(isValidMonthKey('2025-01')).toBe(true);
    expect(isValidMonthKey('2024-12')).toBe(true);
  });

  it('rejects malformed or out-of-range month keys', () => {
    expect(isValidMonthKey('')).toBe(false);
    expect(isValidMonthKey('2026/08')).toBe(false);
    expect(isValidMonthKey('2026-8')).toBe(false);
    expect(isValidMonthKey('26-08')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-08-15')).toBe(false);
  });
});

describe('currentMonthKey', () => {
  it('formats an injected Date as a zero-padded YYYY-MM key', () => {
    expect(currentMonthKey(new Date(2026, 7, 24))).toBe('2026-08');
    expect(currentMonthKey(new Date(2025, 0, 1))).toBe('2025-01');
    expect(currentMonthKey(new Date(2024, 11, 31))).toBe('2024-12');
  });

  it('throws RangeError for an invalid Date instance', () => {
    expect(() => currentMonthKey(new Date('not-a-date'))).toThrow(RangeError);
  });
});

describe('pendingPaymentsForMonth', () => {
  it('generates one draft per active obligation for the given month', () => {
    const drafts = pendingPaymentsForMonth(
      [obligation('rent-id'), obligation('power-id')],
      '2026-08',
    );
    expect(drafts).toEqual([
      { obligationId: 'rent-id', month: '2026-08' },
      { obligationId: 'power-id', month: '2026-08' },
    ]);
  });

  it('skips inactive obligations without disturbing the rest', () => {
    const drafts = pendingPaymentsForMonth(
      [obligation('a'), obligation('inactive', false), obligation('c')],
      '2026-02',
    );
    expect(drafts).toEqual([
      { obligationId: 'a', month: '2026-02' },
      { obligationId: 'c', month: '2026-02' },
    ]);
  });

  it('preserves input order across multiple obligations', () => {
    const drafts = pendingPaymentsForMonth(
      [obligation('z'), obligation('m'), obligation('a')],
      '2026-01',
    );
    expect(drafts.map((draft) => draft.obligationId)).toEqual(['z', 'm', 'a']);
  });

  it('treats dueDay as display-only: due day 31 still appears pending in February', () => {
    const drafts = pendingPaymentsForMonth([obligation('late', true, 31)], '2026-02');
    expect(drafts).toEqual([{ obligationId: 'late', month: '2026-02' }]);
  });

  it('returns [] for empty input', () => {
    expect(pendingPaymentsForMonth([], '2026-08')).toEqual([]);
  });

  it('throws RangeError for a malformed month key', () => {
    expect(() => pendingPaymentsForMonth([obligation('x')], '2026-8')).toThrow(RangeError);
    expect(() => pendingPaymentsForMonth([obligation('x')], '2026-08-15')).toThrow(RangeError);
    expect(() => pendingPaymentsForMonth([obligation('x')], '')).toThrow(RangeError);
  });
});
