import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/app/i18n';
import QuickSidePurchase from '@/features/purchases/components/QuickSidePurchase.vue';
import { db } from '@/services/idb/db';
import { todayIso } from '@/services/idb/exchangeRates';

/**
 * IndexedDB callbacks fire on macrotasks, so plain flushPromises is not
 * enough to settle the open/save pipeline under fake-indexeddb.
 */
async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function mountQsp() {
  const wrapper = mount(QuickSidePurchase, {
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
  await settle();
  return wrapper;
}

/**
 * Always re-query from the root: wrappers captured around teleported/stub
 * content can point at detached nodes after a re-render.
 */
function dialogOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('[data-testid="purchase-dialog"]');
}

beforeEach(async () => {
  await db.sidePurchase.clear();
  await db.exchangeRates.clear();
});

describe('<QuickSidePurchase>', () => {
  it('opens a modal and converts a local amount via the daily rate at save time', async () => {
    await db.exchangeRates.put({
      date: todayIso(),
      rate: 89_500,
      updatedAt: new Date().toISOString(),
    });

    const wrapper = await mountQsp();
    await wrapper.find('[data-testid="purchase-fab"]').trigger('click');
    await settle();

    expect(dialogOf(wrapper).exists()).toBe(true);

    // Default choice is the local currency; type 89,500 LBP → $1.00.
    const inputs = dialogOf(wrapper).findAll('input');
    expect(inputs).toHaveLength(2); // amount + note
    await inputs[0]!.setValue('89500');
    await settle();
    expect(wrapper.find('[data-testid="purchase-preview"]').text()).toContain('$1.00');

    await dialogOf(wrapper).findAll('input')[1]!.setValue('كهرباء');
    await wrapper.find('[data-testid="purchase-save"]').trigger('click');
    await settle();

    const all = await db.sidePurchase.toArray();
    expect(all).toHaveLength(1);
    const row = all[0]!;
    expect(row.date).toBe(todayIso());
    expect(row.currency).toBe('LBP');
    expect(row.amountCents).toBe(8_950_000);
    expect(row.exchangeRate).toBe(89_500);
    expect(row.amountUsdCents).toBe(100);
    expect(row.note).toBe('كهرباء');

    await vi.waitFor(() => {
      expect(wrapper.emitted('saved')).toHaveLength(1);
    });
    expect(dialogOf(wrapper).exists()).toBe(false);
  });

  it('saves USD amounts without conversion and stores the raw cents', async () => {
    await db.exchangeRates.put({
      date: todayIso(),
      rate: 89_500,
      updatedAt: new Date().toISOString(),
    });

    const wrapper = await mountQsp();
    await wrapper.find('[data-testid="purchase-fab"]').trigger('click');
    await settle();

    // Toggle to USD (first radio option).
    await dialogOf(wrapper).findAll('[role="radio"]')[0]!.trigger('click');
    await settle();
    await dialogOf(wrapper).findAll('input')[0]!.setValue('12.50');
    await settle();
    expect(
      (wrapper.find('[data-testid="purchase-save"]').element as HTMLButtonElement).disabled,
    ).toBe(false);

    await wrapper.find('[data-testid="purchase-save"]').trigger('click');
    await settle();

    const all = await db.sidePurchase.toArray();
    expect(all).toHaveLength(1);
    const row = all[0]!;
    expect(row.currency).toBe('USD');
    expect(row.amountCents).toBe(1_250);
    expect(row.amountUsdCents).toBe(1_250);
    expect(row.note).toBeUndefined();
  });

  it('blocks saving a local amount when no daily rate is known', async () => {
    const wrapper = await mountQsp();
    await wrapper.find('[data-testid="purchase-fab"]').trigger('click');
    await settle();

    await dialogOf(wrapper).findAll('input')[0]!.setValue('5000');
    await settle();

    expect(
      (wrapper.find('[data-testid="purchase-save"]').element as HTMLButtonElement).disabled,
    ).toBe(true);

    await wrapper.find('[data-testid="purchase-save"]').trigger('click');
    await settle();
    expect(await db.sidePurchase.count()).toBe(0);
  });
});
