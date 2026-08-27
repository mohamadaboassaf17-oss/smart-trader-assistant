import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import ObligationsView from '@/features/obligations/ObligationsView.vue';
import { db } from '@/services/idb/db';
import { currentMonthKey } from '@/utils/obligation-schedule';

import type { Obligation, ObligationPayment } from '@/types/domain';

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
    dueDay: seq,
    active: true,
    ...overrides,
  };
}

function seedPayment(
  obligationId: string,
  overrides: Partial<ObligationPayment> = {},
): ObligationPayment {
  seq += 1;
  return {
    id: `${String(seq).padStart(8, '0')}-bbbb-cccc-dddd-eeeeeeeeeeee`,
    createdAt: nowIso,
    updatedAt: nowIso,
    obligationId,
    month,
    status: 'pending',
    ...overrides,
  };
}

async function mountObligations() {
  const wrapper = mount(ObligationsView, {
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
  await settle();
  return wrapper;
}

/** Always re-query from the root: teleported/stub content can detach. */
function paymentRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-testid="payment-row"]');
}

beforeEach(async () => {
  seq = 0;
  await db.obligation.clear();
  await db.obligationPayment.clear();
  await db.syncQueue.clear();
});

describe('<ObligationsView>', () => {
  it('shows the empty state when nothing exists yet', async () => {
    const wrapper = await mountObligations();
    expect(wrapper.find('[data-testid="obligations-empty"]').exists()).toBe(true);
    expect(paymentRows(wrapper)).toHaveLength(0);
  });

  it('renders current-month payments with status badges and disables paid ones', async () => {
    const rent = seedObligation({ id: '11111111-aaaa-bbbb-cccc-dddddddddddd', dueDay: 5 });
    const power = seedObligation({
      id: '22222222-aaaa-bbbb-cccc-dddddddddddd',
      name: 'كهرباء',
      amountUsdCents: 45_00,
      dueDay: 10,
    });
    await db.obligation.bulkPut([rent, power]);
    // Rent already settled this month; generation must NOT overwrite it.
    await db.obligationPayment.put(
      seedPayment(rent.id, {
        status: 'paid',
        paidAt: nowIso,
      }),
    );

    const wrapper = await mountObligations();
    const cards = paymentRows(wrapper);
    expect(cards).toHaveLength(2);

    // Sorted by dueDay: rent (day 5) first, already paid.
    expect(cards[0]!.find('[data-testid="payment-name"]').text()).toBe('إيجار');
    expect(cards[0]!.find('[data-testid="payment-status"]').text()).toContain('مدفوعة');
    expect(cards[0]!.find('[data-testid="payment-due-day"]').text()).toContain('يوم 5');
    expect(
      (cards[0]!.find('[data-testid="payment-pay"]').element as HTMLButtonElement).disabled,
    ).toBe(true);

    // Power (day 10) was auto-generated as pending by ensurePendingRows.
    expect(cards[1]!.find('[data-testid="payment-name"]').text()).toBe('كهرباء');
    expect(cards[1]!.find('[data-testid="payment-status"]').text()).toContain('معلقة');
    expect(cards[1]!.find('[data-testid="payment-amount"]').text()).toContain('$45.00');
    expect(
      (cards[1]!.find('[data-testid="payment-pay"]').element as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('pays a pending payment through the optimistic queue', async () => {
    const rent = seedObligation();
    await db.obligation.put(rent);

    const wrapper = await mountObligations();
    const cards = paymentRows(wrapper);
    expect(cards).toHaveLength(1);

    await cards[0]!.find('[data-testid="payment-pay"]').trigger('click');
    await settle();

    const stored = (await db.obligationPayment.where('obligationId').equals(rent.id).toArray())[0]!;
    expect(stored.status).toBe('paid');
    expect(typeof stored.paidAt).toBe('string');

    const queueItems = (await db.syncQueue.toArray()).filter(
      (item) => item.entity === 'obligationPayment' && item.op === 'upsert',
    );
    expect(queueItems.length).toBeGreaterThanOrEqual(1);
    expect(queueItems.some((item) => item.entityId === stored.id)).toBe(true);

    // The refreshed row flips its badge and disables further taps.
    const refreshed = paymentRows(wrapper)[0]!;
    expect(refreshed.find('[data-testid="payment-status"]').text()).toContain('مدفوعة');
    expect(
      (refreshed.find('[data-testid="payment-pay"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('saves a new obligation through the dialog', async () => {
    const wrapper = await mountObligations();

    await wrapper.find('[data-testid="obligation-fab"]').trigger('click');
    await settle();

    const dialog = wrapper.find('[data-testid="obligation-dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="obligation-save"]').element as HTMLButtonElement).disabled,
    ).toBe(true);

    await wrapper.find('[data-testid="obligation-name"]').setValue('أجرة عربة');
    await wrapper.find('[data-testid="obligation-amount-wrap"] input').setValue('25.50'); // → 2550 cents
    await wrapper.find('[data-testid="obligation-due-day"]').setValue('15');

    await wrapper.find('[data-testid="obligation-save"]').trigger('click');
    await settle();

    const all = await db.obligation.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('أجرة عربة');
    expect(all[0]!.amountUsdCents).toBe(25_50);
    expect(all[0]!.dueDay).toBe(15);
    expect(all[0]!.active).toBe(true);

    const queueItems = (await db.syncQueue.toArray()).filter(
      (item) => item.entity === 'obligation',
    );
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');

    // Dialog closed; manage section lists the new obligation.
    expect(wrapper.find('[data-testid="obligation-dialog"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="obligation-row"]')).toHaveLength(1);
  });

  it('deletes an obligation after confirm and cascades its payments away', async () => {
    const rent = seedObligation();
    await db.obligation.put(rent);

    const wrapper = await mountObligations();
    // Mount ran ensurePendingRows → one payment row exists for this month.
    expect(await db.obligationPayment.where('obligationId').equals(rent.id).count()).toBe(1);

    const rows = wrapper.findAll('[data-testid="obligation-row"]');
    await rows[0]!.find('[data-testid="obligation-delete"]').trigger('click');
    await settle();

    // Confirmation is inline; nothing was deleted yet.
    expect(wrapper.find('[data-testid="obligation-delete-confirm"]').exists()).toBe(true);
    expect(await db.obligation.count()).toBe(1);

    await wrapper.find('[data-testid="obligation-confirm-delete"]').trigger('click');
    await settle();

    expect(await db.obligation.count()).toBe(0);
    expect(await db.obligationPayment.count()).toBe(0);
    expect(wrapper.findAll('[data-testid="obligation-row"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="obligations-empty"]').exists()).toBe(true);
  });
});
