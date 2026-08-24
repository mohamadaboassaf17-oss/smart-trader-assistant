import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import InventoryView from '@/features/inventory/InventoryView.vue';
import { db } from '@/services/idb/db';

import type { Product } from '@/types/domain';

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

function seedProduct(overrides: Partial<Product> = {}): Product {
  seq += 1;
  const nowIso = new Date().toISOString();
  return {
    id: overrides.id ?? `${String(seq).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
    createdAt: nowIso,
    updatedAt: nowIso,
    name: 'منتج',
    shelfQty: 0,
    warehouseQty: 0,
    ...overrides,
  };
}

async function mountInventory() {
  const wrapper = mount(InventoryView, {
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
  await settle();
  return wrapper;
}

/** Always re-query from the root: teleported/stub content can detach. */
function rows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-testid="product-row"]');
}

beforeEach(async () => {
  seq = 0;
  await db.product.clear();
  await db.inventoryMove.clear();
  await db.syncQueue.clear();
});

describe('<InventoryView>', () => {
  it('renders seeded products sorted by name', async () => {
    // Deliberately seed out of order: the list must re-sort by name.
    await db.product.bulkPut([
      seedProduct({ id: '11111111-aaaa-bbbb-cccc-dddddddddddd', name: 'سمير' }),
      seedProduct({ id: '22222222-aaaa-bbbb-cccc-dddddddddddd', name: 'أحمد' }),
      seedProduct({ id: '33333333-aaaa-bbbb-cccc-dddddddddddd', name: 'خالد' }),
    ]);

    const wrapper = await mountInventory();
    const cards = rows(wrapper);
    expect(cards).toHaveLength(3);

    expect(cards[0]!.find('[data-testid="product-name-cell"]').text()).toBe('أحمد');
    expect(cards[1]!.find('[data-testid="product-name-cell"]').text()).toBe('خالد');
    expect(cards[2]!.find('[data-testid="product-name-cell"]').text()).toBe('سمير');
  });

  it('saves a new product through the optimistic queue path', async () => {
    const wrapper = await mountInventory();
    expect(wrapper.find('[data-testid="inventory-empty"]').exists()).toBe(true);

    await wrapper.find('[data-testid="product-fab"]').trigger('click');
    await settle();

    const dialog = wrapper.find('[data-testid="product-dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="product-save"]').element as HTMLButtonElement).disabled,
    ).toBe(true);

    await wrapper.find('[data-testid="product-name"]').setValue('سكر ناعم');
    // Quantities default to 0; set explicit integer counts.
    await wrapper.find('[data-testid="product-shelf"]').setValue('5');
    await wrapper.find('[data-testid="product-warehouse"]').setValue('2');

    // Fractional quantities are rejected inline.
    await wrapper.find('[data-testid="product-shelf"]').setValue('1.5');
    await settle();
    expect(wrapper.find('[data-testid="product-qty-error"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="product-save"]').element as HTMLButtonElement).disabled,
    ).toBe(true);

    await wrapper.find('[data-testid="product-shelf"]').setValue('5');
    expect(wrapper.find('[data-testid="product-qty-error"]').exists()).toBe(false);
    expect(
      (wrapper.find('[data-testid="product-save"]').element as HTMLButtonElement).disabled,
    ).toBe(false);

    await wrapper.find('[data-testid="product-save"]').trigger('click');
    await settle();

    const all = await db.product.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('سكر ناعم');
    expect(all[0]!.shelfQty).toBe(5);
    expect(all[0]!.warehouseQty).toBe(2);

    const queueItems = (await db.syncQueue.toArray()).filter((item) => item.entity === 'product');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
    expect(queueItems[0]!.entityId).toBe(all[0]!.id);

    // The dialog closes and the row shows up in the local-first list.
    expect(wrapper.find('[data-testid="product-dialog"]').exists()).toBe(false);
    const cards = rows(wrapper);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.text()).toContain('سكر ناعم');
    expect(cards[0]!.find('[data-testid="product-shelf-cell"]').text()).toContain('5');
    expect(cards[0]!.find('[data-testid="product-warehouse-cell"]').text()).toContain('2');
  });

  it('moves stock shelf→warehouse updating quantities AND writing an audit move', async () => {
    const seed = seedProduct({
      id: '44444444-aaaa-bbbb-cccc-dddddddddddd',
      name: 'زيت',
      shelfQty: 10,
      warehouseQty: 2,
    });
    await db.product.put(seed);

    const wrapper = await mountInventory();

    // Tap the row's move action → MoveDialog.
    await rows(wrapper)[0]!.find('[data-testid="product-move"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-testid="move-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="move-product-name"]').text()).toBe('زيت');

    // Current counts are shown.
    const countsText = wrapper.find('[data-testid="move-counts"]').text();
    expect(countsText).toContain('10');
    expect(countsText).toContain('2');

    // Direction defaults to shelf→warehouse; enter a valid quantity.
    expect(
      (wrapper.find('[data-testid="move-to-warehouse"]').element as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');

    await wrapper.find('[data-testid="move-quantity"]').setValue('3');
    expect((wrapper.find('[data-testid="move-save"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );

    await wrapper.find('[data-testid="move-save"]').trigger('click');
    await settle();

    // Product quantities moved.
    const stored = await db.product.get(seed.id);
    expect(stored?.shelfQty).toBe(7);
    expect(stored?.warehouseQty).toBe(5);

    // Audit trail written.
    const moves = await db.inventoryMove.toArray();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.productId).toBe(seed.id);
    expect(moves[0]!.direction).toBe('shelfToWarehouse');
    expect(moves[0]!.quantity).toBe(3);

    // Both writes ride the sync queue.
    const queueEntities = (await db.syncQueue.toArray()).map((item) => item.entity).sort();
    expect(queueEntities).toStrictEqual(['inventoryMove', 'product']);

    // Dialog closes; the refreshed list reflects the new counts.
    expect(wrapper.find('[data-testid="move-dialog"]').exists()).toBe(false);
    const cards = rows(wrapper);
    expect(cards[0]!.find('[data-testid="product-shelf-cell"]').text()).toContain('7');
    expect(cards[0]!.find('[data-testid="product-warehouse-cell"]').text()).toContain('5');
  });

  it('rejects an over-stock move: error surfaced, quantities unchanged', async () => {
    const seed = seedProduct({
      id: '55555555-aaaa-bbbb-cccc-dddddddddddd',
      name: 'أرز',
      shelfQty: 2,
      warehouseQty: 1,
    });
    await db.product.put(seed);

    const wrapper = await mountInventory();

    await rows(wrapper)[0]!.find('[data-testid="product-move"]').trigger('click');
    await settle();

    // Requesting more than the source side holds fails live validation.
    await wrapper.find('[data-testid="move-quantity"]').setValue('5');
    await settle();

    expect(wrapper.find('[data-testid="move-qty-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="move-qty-error"]').text()).toBe('الكمية المتوفرة لا تكفي');
    expect((wrapper.find('[data-testid="move-save"]').element as HTMLButtonElement).disabled).toBe(
      true,
    );

    // Nothing was written: quantities unchanged, no queue traffic.
    const stored = await db.product.get(seed.id);
    expect(stored?.shelfQty).toBe(2);
    expect(stored?.warehouseQty).toBe(1);
    expect(await db.inventoryMove.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });
});
