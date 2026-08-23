import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { effectScope } from 'vue';

import {
  currentMonthIso,
  daysInMonthIso,
  useGoalAdvisor,
  type GoalAdvisorApi,
} from '@/composables/useGoalAdvisor';
import { db } from '@/services/idb/db';

import type { Goal, Sale, SidePurchase } from '@/types/domain';

/**
 * IndexedDB callbacks fire on macrotasks, so plain flushPromises is not
 * enough to settle the load/save pipeline under fake-indexeddb.
 */
async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Run the composable inside an effect scope (it registers a watcher). */
function mountAdvisor(): { api: GoalAdvisorApi; stop: () => void } {
  const scope = effectScope();
  let api: GoalAdvisorApi | undefined;
  scope.run(() => {
    api = useGoalAdvisor();
  });
  if (!api) throw new Error('useGoalAdvisor did not initialize');
  return { api, stop: () => scope.stop() };
}

const PAST_MONTH = '2024-07'; // never equals the runtime "current" month

function saleRow(id: string, date: string, totalUsdCents: number): Sale {
  const nowIso = new Date().toISOString();
  return {
    id,
    createdAt: nowIso,
    updatedAt: nowIso,
    date,
    cashUsdCents: totalUsdCents,
    cashLocalCents: 0,
    exchangeRate: 89_500,
    totalUsdCents,
  };
}

function purchaseRow(id: string, date: string, amountUsdCents: number): SidePurchase {
  const nowIso = new Date().toISOString();
  return {
    id,
    createdAt: nowIso,
    updatedAt: nowIso,
    date,
    amountCents: amountUsdCents,
    currency: 'USD',
    exchangeRate: 89_500,
    amountUsdCents,
  };
}

function goalRow(month: string, targetUsdCents: number): Goal {
  const nowIso = new Date().toISOString();
  return {
    id: `goal-${month}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    month,
    targetUsdCents,
  };
}

beforeEach(async () => {
  await db.sale.clear();
  await db.sidePurchase.clear();
  await db.goal.clear();
  await db.syncQueue.clear();
});

describe('daysInMonthIso', () => {
  it('returns full month lengths including leap years', () => {
    expect(daysInMonthIso('2026-02')).toBe(28);
    expect(daysInMonthIso('2024-02')).toBe(29);
    expect(daysInMonthIso(PAST_MONTH)).toBe(31);
  });

  it('throws for malformed months', () => {
    expect(() => daysInMonthIso('2024-13')).toThrow(RangeError);
    expect(() => daysInMonthIso('junk')).toThrow(RangeError);
  });
});

describe('<useGoalAdvisor>', () => {
  it('computes net as Σsales − ΣsidePurchases for the selected month only', async () => {
    const current = currentMonthIso();
    await db.sale.bulkPut([
      saleRow('s1', `${current}-05`, 30_000),
      saleRow('s2', `${current}-06`, 20_000),
      saleRow('s3', `${PAST_MONTH}-10`, 99_000),
    ]);
    await db.sidePurchase.bulkPut([
      purchaseRow('p1', `${current}-05`, 10_000),
      purchaseRow('p2', `${PAST_MONTH}-11`, 50_000),
    ]);

    const { api, stop } = mountAdvisor();
    await settle();

    expect(api.netUsdCents.value).toBe(40_000);
    // No target yet → gap math stays null and the bar shows zero.
    expect(api.targetUsdCents.value).toBeNull();
    expect(api.remainingUsdCents.value).toBeNull();
    expect(api.requiredPerDayUsdCents.value).toBeNull();
    expect(api.progressPercent.value).toBe(0);

    api.month.value = PAST_MONTH;
    await settle();

    expect(api.netUsdCents.value).toBe(49_000); // 99_000 − 50_000
    stop();
  });

  it('upserts the monthly target through the optimistic queue path', async () => {
    const { api, stop } = mountAdvisor();
    await settle();

    const created = await api.saveTarget(200_000);
    expect(created.ok).toBe(true);
    await settle();

    let rows = await db.goal.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.month).toBe(currentMonthIso());
    expect(rows[0]!.targetUsdCents).toBe(200_000);
    expect(api.targetUsdCents.value).toBe(200_000);
    const firstId = rows[0]!.id;

    let queueItems = (await db.syncQueue.toArray()).filter((item) => item.entity === 'goal');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
    expect(queueItems[0]!.entityId).toBe(firstId);

    // Second save reuses the row id → queue dedupe keeps a single pending op.
    const updated = await api.saveTarget(250_000);
    expect(updated.ok).toBe(true);
    await settle();

    rows = await db.goal.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(firstId);
    expect(rows[0]!.targetUsdCents).toBe(250_000);

    queueItems = (await db.syncQueue.toArray()).filter((item) => item.entity === 'goal');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
    stop();
  });

  it('rejects invalid targets without writing anything', async () => {
    const { api, stop } = mountAdvisor();
    await settle();

    expect((await api.saveTarget(0)).ok).toBe(false);
    expect((await api.saveTarget(-5_000)).ok).toBe(false);
    expect((await api.saveTarget(12.5)).ok).toBe(false);

    expect(await db.goal.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
    stop();
  });

  it('loads an existing target and partial progress when switching months', async () => {
    await db.goal.put(goalRow(PAST_MONTH, 300_000));
    await db.sale.put(saleRow('s1', `${PAST_MONTH}-12`, 75_000));

    const { api, stop } = mountAdvisor();
    await settle();
    api.month.value = PAST_MONTH;
    await settle();

    expect(api.targetUsdCents.value).toBe(300_000);
    expect(api.netUsdCents.value).toBe(75_000);
    expect(api.progressPercent.value).toBe(25);
    expect(api.planningDays.value).toBe(31); // non-current month → full length
    expect(api.remainingUsdCents.value).toBe(225_000);
    expect(api.requiredPerDayUsdCents.value).toBe(Math.ceil(225_000 / 31));
    stop();
  });

  it('clamps negative months to a zero bar while widening the gap values', async () => {
    await db.goal.put(goalRow(PAST_MONTH, 200_000));
    await db.sale.put(saleRow('s1', `${PAST_MONTH}-03`, 50_000));
    await db.sidePurchase.put(purchaseRow('p1', `${PAST_MONTH}-04`, 80_000));

    const { api, stop } = mountAdvisor();
    await settle();
    api.month.value = PAST_MONTH;
    await settle();

    expect(api.netUsdCents.value).toBe(-30_000);
    expect(api.progressPercent.value).toBe(0);
    expect(api.remainingUsdCents.value).toBe(230_000); // target − net widens
    expect(api.requiredPerDayUsdCents.value).toBe(Math.ceil(230_000 / 31));
    stop();
  });

  it('reports a met target with a full bar and zero remaining work', async () => {
    await db.goal.put(goalRow(PAST_MONTH, 200_000));
    await db.sale.put(saleRow('s1', `${PAST_MONTH}-21`, 250_000));

    const { api, stop } = mountAdvisor();
    await settle();
    api.month.value = PAST_MONTH;
    await settle();

    expect(api.netUsdCents.value).toBe(250_000);
    expect(api.progressPercent.value).toBe(100);
    expect(api.remainingUsdCents.value).toBe(0);
    expect(api.requiredPerDayUsdCents.value).toBe(0);
    stop();
  });
});
