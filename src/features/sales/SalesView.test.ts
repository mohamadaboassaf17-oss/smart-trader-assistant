import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import SalesView from '@/features/sales/SalesView.vue';
import { db } from '@/services/idb/db';
import { todayIso } from '@/services/idb/exchangeRates';

import type { Sale } from '@/types/domain';

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

async function mountSales() {
  const wrapper = mount(SalesView, { global: { plugins: [i18n] } });
  await settle();
  return wrapper;
}

/** Amount fields live inside the editor card (the day-nav owns a date input). */
function editorInputs(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.sales__card').findAll('input');
}

beforeEach(async () => {
  await db.sale.clear();
  await db.exchangeRates.clear();
});

describe('<SalesView>', () => {
  it('saves a new day entry optimistically with the persisted rate', async () => {
    const wrapper = await mountSales();
    const inputs = editorInputs(wrapper);
    await inputs[0]!.setValue('25');
    await inputs[1]!.setValue('250000'); // → 25_000_000 local cents
    await inputs[2]!.setValue('89500');

    expect(wrapper.find('[data-testid="sales-total-preview"]').text()).toContain('$27.79');

    await wrapper.find('[data-testid="sales-save"]').trigger('click');
    await settle();

    const all = await db.sale.toArray();
    expect(all).toHaveLength(1);
    const row = all[0]!;
    expect(row.date).toBe(todayIso());
    expect(row.exchangeRate).toBe(89_500);
    expect(row.totalUsdCents).toBe(2_779);
    // Rate is also stored per business day.
    const rateEntry = await db.exchangeRates.get(todayIso());
    expect(rateEntry?.rate).toBe(89_500);
  });

  it('edits an existing day in place through the same queue path', async () => {
    const nowIso = new Date().toISOString();
    const seed: Sale = {
      id: '11111111-2222-3333-4444-555555555555',
      createdAt: nowIso,
      updatedAt: nowIso,
      date: todayIso(),
      cashUsdCents: 2_500,
      cashLocalCents: 0,
      exchangeRate: 89_500,
      totalUsdCents: 2_500,
    };
    await db.sale.put(seed);

    const wrapper = await mountSales();
    expect(wrapper.find('[data-testid="sales-editing"]').exists()).toBe(true);

    const inputs = editorInputs(wrapper);
    await inputs[0]!.setValue('30');
    await wrapper.find('[data-testid="sales-save"]').trigger('click');
    await settle();

    const all = await db.sale.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(seed.id);
    expect(all[0]!.cashUsdCents).toBe(3_000);
    expect(all[0]!.totalUsdCents).toBe(3_000);
    expect(all[0]!.updatedAt >= seed.updatedAt).toBe(true);
  });

  it('navigates to the previous day, shows an empty editor, and returns via history', async () => {
    const nowIso = new Date().toISOString();
    await db.sale.put({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      createdAt: nowIso,
      updatedAt: nowIso,
      date: todayIso(),
      cashUsdCents: 1_000,
      cashLocalCents: 0,
      exchangeRate: 90_000,
      totalUsdCents: 1_000,
    });

    const wrapper = await mountSales();
    expect(wrapper.find('[data-testid="sales-editing"]').exists()).toBe(true);

    await wrapper.find('[data-testid="sales-prev-day"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="sales-editing"]').exists()).toBe(false);

    // History strip lists today; tapping it reloads that day into the editor.
    const historyItem = wrapper.find('[data-testid="sales-history"] button');
    expect(historyItem.exists()).toBe(true);
    expect(historyItem.text()).toContain('$10.00');

    await historyItem.trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="sales-editing"]').exists()).toBe(true);
  });

  it('hides next-day navigation on today and keeps save disabled while empty', async () => {
    const wrapper = await mountSales();
    expect(
      (wrapper.find('[data-testid="sales-next-day"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((wrapper.find('[data-testid="sales-save"]').element as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
