<script setup lang="ts">
/**
 * Financial dashboard (PRD §6.6) — M6.
 *
 * Month-scoped snapshot of the shop's money:
 *   net = gross sales − side purchases − PAID obligations.
 *
 * On mount this month's pending obligation rows are materialized
 * (`ensurePendingRows`, idempotent), then every input is read local-first
 * from Dexie. Paid obligations ride the shared `useObligations()` refs and
 * are valued via the payments→obligation-amount join, so the net here is
 * the exact same figure the Goals tab computes for the same month. A losing
 * month shows its negative net verbatim; an empty month gets a friendly
 * empty state instead of three zero cards.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useObligations } from '@/composables/useObligations';
import { useToast } from '@/composables/useToast';
import GoalProgressBar from '@/features/goals/components/GoalProgressBar.vue';
import { db } from '@/services/idb/db';
import { tryAsync } from '@/types/result';
import {
  dashboardNetUsdCents,
  grossSalesUsdCents,
  paidObligationsTotalUsdCents,
} from '@/utils/dashboard-math';
import { formatMoney } from '@/utils/money';
import { currentMonthKey } from '@/utils/obligation-schedule';
import { paidObligationAmountsForMonth } from '@/utils/paid-obligations';

const { t } = useI18n();
const toast = useToast();
const { obligations, payments, refresh: refreshObligations, ensurePendingRows } = useObligations();

/** Frozen at mount: the dashboard is a current-month snapshot by design. */
const monthKey = currentMonthKey();
const monthPrefix = `${monthKey}-`;

const saleTotalsUsdCents = ref<number[]>([]);
const sidePurchaseAmountsUsdCents = ref<number[]>([]);
const targetUsdCents = ref<number | null>(null);

const paidObligationAmounts = computed(() =>
  paidObligationAmountsForMonth(obligations.value, payments.value, monthKey),
);

const grossUsdCents = computed(() => grossSalesUsdCents(saleTotalsUsdCents.value));
const paidObligationsUsdCents = computed(() =>
  paidObligationsTotalUsdCents(paidObligationAmounts.value),
);
const netUsdCents = computed(() =>
  dashboardNetUsdCents(
    saleTotalsUsdCents.value,
    sidePurchaseAmountsUsdCents.value,
    paidObligationAmounts.value,
  ),
);

/** Zero data of any kind → friendly empty state instead of three zeros. */
const hasData = computed(
  () =>
    saleTotalsUsdCents.value.length > 0 ||
    sidePurchaseAmountsUsdCents.value.length > 0 ||
    paidObligationAmounts.value.length > 0,
);

/**
 * Bar fill 0–100 with the SAME clamp semantics as the goals advisor: a
 * negative or missing-target month shows no fill while the value stays
 * visible as text.
 */
const progressPercent = computed(() => {
  const target = targetUsdCents.value;
  if (target === null || target <= 0) return 0;
  const percent = (netUsdCents.value / target) * 100;
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
});

const netLine = computed(() => {
  const target = targetUsdCents.value;
  if (target === null) return '';
  return t('goals.netOfTarget', {
    net: formatMoney(netUsdCents.value, 'USD'),
    target: formatMoney(target, 'USD'),
  });
});

async function load(): Promise<void> {
  const salesResult = await tryAsync(() => db.sale.toArray());
  if (!salesResult.ok) {
    console.error('[dashboard] sales query failed', { message: salesResult.error.message });
    toast.error(t('common.error'));
    return;
  }
  const purchasesResult = await tryAsync(() => db.sidePurchase.toArray());
  if (!purchasesResult.ok) {
    console.error('[dashboard] side purchases query failed', {
      message: purchasesResult.error.message,
    });
    toast.error(t('common.error'));
    return;
  }
  const goalResult = await tryAsync(() => db.goal.where('month').equals(monthKey).toArray());
  if (!goalResult.ok) {
    console.error('[dashboard] goal query failed', { message: goalResult.error.message });
    toast.error(t('common.error'));
    return;
  }

  saleTotalsUsdCents.value = salesResult.value
    .filter((sale) => sale.date.startsWith(monthPrefix))
    .map((sale) => sale.totalUsdCents);
  sidePurchaseAmountsUsdCents.value = purchasesResult.value
    .filter((purchase) => purchase.date.startsWith(monthPrefix))
    .map((purchase) => purchase.amountUsdCents);
  // Latest-written goal row wins (legacy duplicates never crash us).
  const latestGoal = [...goalResult.value].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0];
  targetUsdCents.value = latestGoal?.targetUsdCents ?? null;
}

onMounted(async () => {
  await ensurePendingRows(); // materialize this month's pending rows (idempotent)
  await refreshObligations(); // populate obligations/payments refs for the join
  await load();
});
</script>

<template>
  <section class="dash">
    <h2 class="dash__title" data-testid="dashboard-title">{{ t('dashboard.title') }}</h2>
    <p class="dash__month" data-testid="dashboard-month">
      {{ t('dashboard.monthLine', { month: monthKey }) }}
    </p>

    <p v-if="!hasData" class="dash__empty" data-testid="dashboard-empty">
      {{ t('dashboard.empty') }}
    </p>

    <template v-else>
      <div class="dash__grid">
        <div class="dash__card" data-testid="stat-gross">
          <span class="dash__label">{{ t('dashboard.gross') }}</span>
          <strong class="dash__value dash__value--brand" dir="ltr" data-testid="gross-value">
            {{ formatMoney(grossUsdCents, 'USD') }}
          </strong>
        </div>

        <div class="dash__card" data-testid="stat-net">
          <span class="dash__label">{{ t('dashboard.net') }}</span>
          <strong
            class="dash__value"
            :class="netUsdCents < 0 ? 'dash__value--danger' : 'dash__value--success'"
            dir="ltr"
            data-testid="net-value"
          >
            {{ formatMoney(netUsdCents, 'USD') }}
          </strong>
        </div>

        <div class="dash__card" data-testid="stat-obligations">
          <span class="dash__label">{{ t('dashboard.paidObligations') }}</span>
          <strong
            class="dash__value dash__value--warning"
            dir="ltr"
            data-testid="obligations-value"
          >
            {{ formatMoney(paidObligationsUsdCents, 'USD') }}
          </strong>
        </div>
      </div>

      <div v-if="targetUsdCents !== null" class="dash__goal" data-testid="dashboard-goal-card">
        <p class="dash__goal-line" data-testid="dashboard-goal-net">{{ netLine }}</p>
        <GoalProgressBar :percent="progressPercent" :label="t('goals.progress')" />
      </div>
      <p v-else class="dash__no-goal" data-testid="dashboard-no-goal">
        {{ t('goals.noTarget') }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block-end: var(--space-16);
}

.dash__title {
  font-size: var(--font-size-base);
  font-weight: 700;
}

.dash__month {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.dash__empty,
.dash__no-goal {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.dash__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--space-2);
}

.dash__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.dash__label {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.dash__value {
  overflow-wrap: anywhere;
  font-size: var(--font-size-lg);
}

.dash__value--brand {
  color: var(--color-brand-700);
}

.dash__value--success {
  color: var(--color-success);
}

.dash__value--danger {
  color: var(--color-danger);
}

.dash__value--warning {
  color: var(--color-warning);
}

.dash__goal {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.dash__goal-line {
  font-weight: 600;
  font-size: var(--font-size-base);
}
</style>
