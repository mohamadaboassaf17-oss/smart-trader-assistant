import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import SuppliersView from '@/features/suppliers/SuppliersView.vue';
import { db } from '@/services/idb/db';
import { todayIso } from '@/services/idb/exchangeRates';

import type { GoodsInvoice, Supplier } from '@/types/domain';

/**
 * IndexedDB callbacks fire on macrotasks, so plain flushPromises is not
 * enough to settle the load/save pipeline under fake-indexeddb.
 */
async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let seq = 0;

function seedSupplier(overrides: Partial<Supplier> = {}): Supplier {
  seq += 1;
  const nowIso = new Date().toISOString();
  return {
    id: overrides.id ?? `${String(seq).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
    createdAt: nowIso,
    updatedAt: nowIso,
    name: 'مورد',
    ...overrides,
  };
}

function seedInvoice(supplierId: string, overrides: Partial<GoodsInvoice> = {}): GoodsInvoice {
  seq += 1;
  const nowIso = new Date().toISOString();
  return {
    id: `${String(seq).padStart(8, '0')}-bbbb-cccc-dddd-eeeeeeeeeeee`,
    createdAt: nowIso,
    updatedAt: nowIso,
    supplierId,
    date: todayIso(),
    totalUsdCents: 100_000,
    paidCashUsdCents: 40_000,
    debtUsdCents: 60_000,
    ...overrides,
  };
}

async function mountSuppliers() {
  const wrapper = mount(SuppliersView, {
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
  await settle();
  return wrapper;
}

/** Always re-query from the root: teleported/stub content can detach. */
function rows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-testid="supplier-row"]');
}

beforeEach(async () => {
  seq = 0;
  await db.supplier.clear();
  await db.goodsInvoice.clear();
  await db.syncQueue.clear();
});

describe('<SuppliersView>', () => {
  it('renders seeded suppliers sorted by derived outstanding balance desc', async () => {
    // Deliberately seed out of order: the list must re-sort by balance.
    const noDebt = seedSupplier({ name: 'أحمد' });
    const biggest = seedSupplier({ name: 'سمير' });
    const middle = seedSupplier({ name: 'خالد' });
    await db.supplier.bulkPut([noDebt, biggest, middle]);
    await db.goodsInvoice.bulkPut([
      seedInvoice(biggest.id, { debtUsdCents: 60_000 }),
      seedInvoice(middle.id, { debtUsdCents: 30_000 }),
      seedInvoice(middle.id, { debtUsdCents: 10_000 }),
    ]);

    const wrapper = await mountSuppliers();
    const cards = rows(wrapper);
    expect(cards).toHaveLength(3);

    expect(cards[0]!.text()).toContain('سمير');
    expect(cards[0]!.find('[data-testid="supplier-balance-badge"]').text()).toContain('$600.00');
    expect(cards[1]!.text()).toContain('خالد');
    expect(cards[1]!.find('[data-testid="supplier-balance-badge"]').text()).toContain('$400.00');
    expect(cards[2]!.text()).toContain('أحمد');
    expect(cards[2]!.find('[data-testid="supplier-balance-badge"]').text()).toContain('$0.00');
  });

  it('saves a supplier through the optimistic queue path', async () => {
    const wrapper = await mountSuppliers();
    expect(wrapper.find('[data-testid="suppliers-empty"]').exists()).toBe(true);

    await wrapper.find('[data-testid="supplier-fab"]').trigger('click');
    await settle();

    const dialog = wrapper.find('[data-testid="supplier-dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="supplier-save"]').element as HTMLButtonElement).disabled,
    ).toBe(true);

    await wrapper.find('[data-testid="supplier-name"]').setValue('مورد الخضار');
    await wrapper.find('[data-testid="supplier-phone"]').setValue('70123456');
    await wrapper.find('[data-testid="supplier-save"]').trigger('click');
    await settle();

    const all = await db.supplier.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('مورد الخضار');
    expect(all[0]!.phone).toBe('+96170123456');

    const queueItems = (await db.syncQueue.toArray()).filter((item) => item.entity === 'supplier');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
    expect(queueItems[0]!.entityId).toBe(all[0]!.id);

    // The dialog closes and the row shows up in the local-first list.
    expect(wrapper.find('[data-testid="supplier-dialog"]').exists()).toBe(false);
    const cards = rows(wrapper);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.text()).toContain('مورد الخضار');
  });

  it('blocks deleting a supplier that has invoices and surfaces the error', async () => {
    const seed = seedSupplier({ name: 'لا يُحذف' });
    await db.supplier.put(seed);
    await db.goodsInvoice.put(seedInvoice(seed.id));

    const { clearToasts, useToast } = await import('@/composables/useToast');
    clearToasts();
    const toast = useToast();

    const wrapper = await mountSuppliers();
    await rows(wrapper)[0]!.find('[data-testid="supplier-delete"]').trigger('click');
    await settle();

    // Confirmation is inline; nothing was deleted yet.
    expect(wrapper.find('[data-testid="supplier-delete-confirm"]').exists()).toBe(true);
    expect(await db.supplier.count()).toBe(1);

    await wrapper.find('[data-testid="supplier-confirm-delete"]').trigger('click');
    await settle();

    expect(await db.supplier.count()).toBe(1);
    expect(await db.goodsInvoice.count()).toBe(1);
    expect((await db.syncQueue.toArray()).filter((i) => i.entity === 'supplier')).toHaveLength(0);
    expect(toast.toasts.value.some((item) => item.message.includes('فواتير'))).toBe(true);
    expect(rows(wrapper)).toHaveLength(1);
  });

  it('persists an invoice with debt 60000 from 100000 − 40000 through the queue', async () => {
    const seed = seedSupplier({ name: 'مورد الفواتير' });
    await db.supplier.put(seed);

    const wrapper = await mountSuppliers();

    // Tap the row → drill-in detail panel (in-view swap, no route).
    await rows(wrapper)[0]!.trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="supplier-detail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="supplier-balance"]').text()).toContain('$0.00');

    await wrapper.find('[data-testid="supplier-add-invoice"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="invoice-dialog"]').exists()).toBe(true);

    // The editor is prefilled with this supplier.
    const select = wrapper.find('[data-testid="invoice-supplier"]').element as HTMLSelectElement;
    expect(select.value).toBe(seed.id);
    expect((wrapper.find('[data-testid="invoice-date"]').element as HTMLInputElement).value).toBe(
      todayIso(),
    );

    await wrapper.find('[data-testid="invoice-total-wrap"] input').setValue('1000'); // $1000.00 → 100000 cents
    await wrapper.find('[data-testid="invoice-paid-wrap"] input').setValue('400'); // $400.00 → 40000 cents
    await settle();

    expect(wrapper.find('[data-testid="invoice-debt-preview"]').text()).toContain('$600.00');
    expect(
      (wrapper.find('[data-testid="invoice-save"]').element as HTMLButtonElement).disabled,
    ).toBe(false);

    await wrapper.find('[data-testid="invoice-save"]').trigger('click');
    await settle();

    const all = await db.goodsInvoice.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.supplierId).toBe(seed.id);
    expect(all[0]!.date).toBe(todayIso());
    expect(all[0]!.totalUsdCents).toBe(100_000);
    expect(all[0]!.paidCashUsdCents).toBe(40_000);
    expect(all[0]!.debtUsdCents).toBe(60_000);

    const queueItems = (await db.syncQueue.toArray()).filter(
      (item) => item.entity === 'goodsInvoice',
    );
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
    expect(queueItems[0]!.entityId).toBe(all[0]!.id);

    // The detail panel refreshes its history and derived balance.
    expect(wrapper.findAll('[data-testid="invoice-row"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="supplier-balance"]').text()).toContain('$600.00');
  });
});
