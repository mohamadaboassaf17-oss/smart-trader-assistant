import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import DashboardView from '@/features/dashboard/DashboardView.vue';
import { db } from '@/services/idb/db';
import { currentMonthKey } from '@/utils/obligation-schedule';

import type { Goal, Obligation, ObligationPayment, Sale, SidePurchase } from '@/types/domain';

/**
 * IndexedDB callbacks fire on macrotasks, so plain flushPromises is not
 * enough to settle the mount pipeline (ensurePendingRows → refresh → load)
 * under fake-indexeddb.
 */
async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let seq = 0;
const month = currentMonthKey();
const OTHER_MONTH = '1999-12'; // never equals the runtime "current" month
const nowIso = new Date().toISOString();

function saleRow(id: string, date: string, totalUsdCents: number): Sale {
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

function obligationRow(overrides: Partial<Obligation> = {}): Obligation {
  seq += 1;
  return {
    id: overrides.id ?? `${String(seq).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
    createdAt: nowIso,
    updatedAt: nowIso,
    name: 'إيجار',
    amountUsdCents: 45_00,
    dueDay: 5,
    active: true,
    ...overrides,
  };
}

function paymentRow(
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

function goalRow(targetUsdCents: number): Goal {
  return {
    id: `goal-${month}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    month,
    targetUsdCents,
  };
}

async function mountDashboard() {
  const wrapper = mount(DashboardView, { global: { plugins: [i18n] } });
  await settle();
  return wrapper;
}

beforeEach(async () => {
  seq = 0;
  await db.sale.clear();
  await db.sidePurchase.clear();
  await db.goal.clear();
  await db.obligation.clear();
  await db.obligationPayment.clear();
  await db.syncQueue.clear();
});

describe('<DashboardView>', () => {
  it('shows the empty state and month line when nothing exists yet', async () => {
    const wrapper = await mountDashboard();

    expect(wrapper.find('[data-testid="dashboard-month"]').text()).toContain(month);
    expect(wrapper.find('[data-testid="dashboard-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="gross-value"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="net-value"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="obligations-value"]').exists()).toBe(false);
  });

  it('renders gross/net/paid-obligation cards excluding rows across the month boundary', async () => {
    // $100 gross this month; the $999 sale last December must not leak in.
    await db.sale.bulkPut([
      saleRow('s1', `${month}-05`, 100_00),
      saleRow('s2', `${OTHER_MONTH}-20`, 999_00),
    ]);
    // $30 side purchase this month; the $777 one outside the month excluded.
    await db.sidePurchase.bulkPut([
      purchaseRow('p1', `${month}-07`, 30_00),
      purchaseRow('p2', `${OTHER_MONTH}-21`, 777_00),
    ]);
    // Rent ($45) PAID this month → deducted. Power ($20) gets a generated
    // PENDING row on mount → must NOT be deducted.
    const rent = obligationRow({ id: 'rent-id', amountUsdCents: 45_00 });
    const power = obligationRow({
      id: 'power-id',
      name: 'كهرباء',
      amountUsdCents: 20_00,
      dueDay: 10,
    });
    await db.obligation.bulkPut([rent, power]);
    await db.obligationPayment.put(paymentRow(rent.id, { status: 'paid', paidAt: nowIso }));

    const wrapper = await mountDashboard();

    expect(wrapper.find('[data-testid="dashboard-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="gross-value"]').text()).toContain('$100.00');
    // PRD §6.6: 100 − 30 − 45 = 25.
    expect(wrapper.find('[data-testid="net-value"]').text()).toContain('$25.00');
    expect(wrapper.find('[data-testid="obligations-value"]').text()).toContain('$45.00');

    // Mount materialized power's pending row; it contributes nothing.
    const paymentRows = await db.obligationPayment.toArray();
    expect(paymentRows).toHaveLength(2);
    expect(paymentRows.filter((row) => row.status === 'pending')).toHaveLength(1);
  });

  it('renders the goal bar fed by the same net/target math as the Goals tab', async () => {
    await db.sale.put(saleRow('s1', `${month}-03`, 100_00)); // net = $100
    await db.goal.put(goalRow(400_00)); // target = $400 → 25%

    const wrapper = await mountDashboard();

    expect(wrapper.find('[data-testid="dashboard-goal-card"]').exists()).toBe(true);
    const bar = wrapper.find('[data-testid="goal-progress-bar"]');
    expect(bar.exists()).toBe(true);
    expect(bar.attributes('aria-valuenow')).toBe('25');
    expect(wrapper.find('[data-testid="dashboard-goal-net"]').text()).toContain('$100.00');
    expect(wrapper.find('[data-testid="dashboard-goal-net"]').text()).toContain('$400.00');
  });

  it('shows the no-target hint instead of a bar when no goal exists', async () => {
    await db.sale.put(saleRow('s1', `${month}-03`, 100_00));

    const wrapper = await mountDashboard();

    expect(wrapper.find('[data-testid="dashboard-no-goal"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="goal-progress-bar"]').exists()).toBe(false);
  });

  it('displays a losing month without clamping to zero', async () => {
    await db.sale.put(saleRow('s1', `${month}-02`, 10_00));
    await db.sidePurchase.put(purchaseRow('p1', `${month}-04`, 80_00));

    const wrapper = await mountDashboard();

    expect(wrapper.find('[data-testid="dashboard-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="net-value"]').text()).toContain('-$70.00');
  });
});
