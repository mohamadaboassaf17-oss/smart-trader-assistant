import { beforeEach, describe, expect, it } from 'vitest';

import { useObligations, type ObligationsApi } from '@/composables/useObligations';
import { db } from '@/services/idb/db';
import { currentMonthKey } from '@/utils/obligation-schedule';

import type { Obligation, ObligationPayment } from '@/types/domain';

/**
 * The composable is a module-scope singleton over real IndexedDB
 * (fake-indexeddb via the global test setup), so these tests exercise the
 * exact save/remove path features use — optimistic put + sync queue.
 */
const api: ObligationsApi = useObligations();

let seq = 0;
const month = currentMonthKey();
const nowIso = new Date().toISOString();

function seedObligation(overrides: Partial<Obligation> = {}): Obligation {
  seq += 1;
  return {
    id: overrides.id ?? `${String(seq).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
    createdAt: nowIso,
    updatedAt: nowIso,
    name: 'إيجار',
    amountUsdCents: 200_00,
    dueDay: 1,
    active: true,
    ...overrides,
  };
}

function paymentsFor(obligationId: string): Promise<ObligationPayment[]> {
  return db.obligationPayment.where('obligationId').equals(obligationId).toArray();
}

beforeEach(async () => {
  seq = 0;
  await db.obligation.clear();
  await db.obligationPayment.clear();
  await db.syncQueue.clear();
});

describe('ensurePendingRows', () => {
  it('creates one pending row per ACTIVE obligation and is idempotent', async () => {
    const rent = seedObligation({ name: 'إيجار' });
    const power = seedObligation({ name: 'كهرباء' });
    await db.obligation.bulkPut([rent, power]);

    await api.ensurePendingRows();
    let rows = await db.obligationPayment.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.month === month)).toBe(true);
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
    expect(rows.every((row) => typeof row.paidAt === 'undefined')).toBe(true);
    // Full rows: UUID v4 id + both timestamps, persisted through the queue.
    expect(rows.every((row) => /^[0-9a-f-]{36}$/.test(row.id))).toBe(true);
    expect(rows.every((row) => row.createdAt !== '' && row.updatedAt !== '')).toBe(true);
    expect(
      (await db.syncQueue.toArray()).filter((item) => item.entity === 'obligationPayment'),
    ).toHaveLength(2);

    // Second call adds nothing — existence check short-circuits.
    await api.ensurePendingRows();
    rows = await db.obligationPayment.toArray();
    expect(rows).toHaveLength(2);
    expect(
      (await db.syncQueue.toArray()).filter((item) => item.entity === 'obligationPayment'),
    ).toHaveLength(2);
  });

  it('skips inactive obligations without touching the rest', async () => {
    const activeRow = seedObligation({ name: 'إنترنت' });
    const inactive = seedObligation({ name: 'اشتراك موقوف', active: false });
    await db.obligation.bulkPut([activeRow, inactive]);

    await api.ensurePendingRows();

    expect(await db.obligationPayment.count()).toBe(1);
    expect(await paymentsFor(activeRow.id)).toHaveLength(1);
    expect(await paymentsFor(inactive.id)).toHaveLength(0);
  });
});

describe('markPaid', () => {
  it('sets status paid + paidAt + refreshed updatedAt through the queue', async () => {
    const rent = seedObligation();
    await db.obligation.put(rent);
    await api.ensurePendingRows();

    const stored = (await paymentsFor(rent.id))[0]!;
    expect(stored.status).toBe('pending');

    const result = await api.markPaid(stored);
    expect(result.ok).toBe(true);

    const paid = (await db.obligationPayment.get(stored.id))!;
    expect(paid.status).toBe('paid');
    expect(typeof paid.paidAt).toBe('string');
    expect(new Date(paid.paidAt!).getTime()).not.toBeNaN();
    expect(paid.updatedAt >= stored.updatedAt).toBe(true);

    // Queue dedupes by [entity+entityId]: the mark-paid upsert REPLACES the
    // generation upsert for the same row, so exactly one pending item remains.
    const queueItems = (await db.syncQueue.toArray()).filter(
      (item) => item.entity === 'obligationPayment' && item.op === 'upsert',
    );
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.entityId).toBe(stored.id);
    expect((queueItems[0]!.payload as unknown as ObligationPayment).status).toBe('paid');
  });

  it('materializes a missing row first (defensive path)', async () => {
    const rent = seedObligation();
    await db.obligation.put(rent);
    // No payment row exists for this month — pass an unpersisted snapshot.
    const ghost: ObligationPayment = {
      id: '99999999-zzzz-yyyy-xxxx-wwwwwwwwwwww',
      createdAt: nowIso,
      updatedAt: nowIso,
      obligationId: rent.id,
      month,
      status: 'pending',
    };
    expect(await db.obligationPayment.count()).toBe(0);

    const result = await api.markPaid(ghost);
    expect(result.ok).toBe(true);

    const saved = await db.obligationPayment.get(ghost.id);
    expect(saved?.status).toBe('paid');
    expect(saved?.month).toBe(month);
  });
});

describe('removeObligation', () => {
  it('deletes the obligation AND cascades its payment removal', async () => {
    const rent = seedObligation();
    await db.obligation.put(rent);
    await api.ensurePendingRows();
    expect(await db.obligation.count()).toBe(1);
    expect(await db.obligationPayment.count()).toBe(1);

    const result = await api.removeObligation(rent);
    expect(result.ok).toBe(true);

    expect(await db.obligation.count()).toBe(0);
    expect(await db.obligationPayment.count()).toBe(0);

    // Both the parent tombstone and the child removes ride the queue.
    const queueItems = (await db.syncQueue.toArray()).filter((item) => item.op === 'remove');
    const entities = queueItems.map((item) => item.entity).sort();
    expect(entities).toStrictEqual(['obligation', 'obligationPayment']);
    expect(queueItems.find((item) => item.entity === 'obligation')!.entityId).toBe(rent.id);
  });
});

describe('saveObligation validation', () => {
  it('rejects empty names, non-positive amounts, and out-of-range due days', async () => {
    const badName = await api.saveObligation({
      name: '   ',
      amountUsdCents: 100,
      dueDay: 5,
      active: true,
    });
    expect(badName).toStrictEqual({ ok: false, error: 'obligations.invalidName' });

    const badAmount = await api.saveObligation({
      name: 'كهرباء',
      amountUsdCents: 0,
      dueDay: 5,
      active: true,
    });
    expect(badAmount).toStrictEqual({ ok: false, error: 'obligations.invalidAmount' });

    const badDueDay = await api.saveObligation({
      name: 'كهرباء',
      amountUsdCents: 100,
      dueDay: 32,
      active: true,
    });
    expect(badDueDay).toStrictEqual({ ok: false, error: 'obligations.invalidDueDay' });

    expect(await db.obligation.count()).toBe(0);
  });

  it('persists a valid obligation with UUID identity through the queue', async () => {
    const result = await api.saveObligation({
      name: 'أجرة عربة',
      amountUsdCents: 25_00,
      dueDay: 15,
      active: true,
    });
    expect(result.ok).toBe(true);

    const all = await db.obligation.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('أجرة عربة');
    expect(all[0]!.amountUsdCents).toBe(25_00);
    expect(all[0]!.dueDay).toBe(15);

    const queueItems = (await db.syncQueue.toArray()).filter(
      (item) => item.entity === 'obligation',
    );
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
  });
});
