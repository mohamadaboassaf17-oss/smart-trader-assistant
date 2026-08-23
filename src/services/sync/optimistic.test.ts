import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/services/idb/db';

import { applyOptimisticPut, applyOptimisticRemove } from './optimistic';

import type { Sale } from '@/types/domain';

function makeSale(id = 'opt-1'): Sale {
  return {
    id,
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
    date: '2026-08-21',
    cashUsdCents: 2_500,
    cashLocalCents: 100_000,
    exchangeRate: 89_500,
    totalUsdCents: 3_617,
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('applyOptimisticPut', () => {
  it('writes the row and enqueues the upsert', async () => {
    const enqueued: string[] = [];
    const res = await applyOptimisticPut('sale', makeSale(), async (row) => {
      enqueued.push(row.id);
    });
    expect(res).toMatchObject({ ok: true });
    expect(await db.sale.get('opt-1')).not.toBeUndefined();
    expect(enqueued).toEqual(['opt-1']);
  });

  it('rolls back a brand-new row when enqueue fails', async () => {
    const res = await applyOptimisticPut('sale', makeSale(), async () => {
      throw new Error('queue write failed');
    });
    expect(res).toMatchObject({ ok: false });
    expect(await db.sale.get('opt-1')).toBeUndefined();
  });

  it('restores the previous row on failure (no data loss)', async () => {
    const original = makeSale();
    await db.sale.put(original);
    const res = await applyOptimisticPut(
      'sale',
      { ...original, totalUsdCents: 999_999 },
      async () => {
        throw new Error('boom');
      },
    );
    expect(res.ok).toBe(false);
    expect((await db.sale.get('opt-1'))?.totalUsdCents).toBe(original.totalUsdCents);
  });
});

describe('applyOptimisticRemove', () => {
  it('deletes the row and enqueues the remove', async () => {
    await db.sale.put(makeSale());
    const calls: [string, string][] = [];
    const res = await applyOptimisticRemove('sale', makeSale(), async (entity, id) => {
      calls.push([entity, id]);
    });
    expect(res).toMatchObject({ ok: true });
    expect(await db.sale.count()).toBe(0);
    expect(calls).toEqual([['sale', 'opt-1']]);
  });

  it('restores the row if enqueue fails', async () => {
    await db.sale.put(makeSale());
    const res = await applyOptimisticRemove('sale', makeSale(), async () => {
      throw new Error('boom');
    });
    expect(res.ok).toBe(false);
    expect(await db.sale.get('opt-1')).not.toBeUndefined();
  });
});
