/**
 * useGoalAdvisor — monthly goal setter + net-progress wiring (PRD §6.8).
 *
 * Net definition (M6): for the selected month,
 * `net = Σ sale.totalUsdCents − Σ sidePurchase.amountUsdCents − Σ PAID
 * obligation amounts`, read local-first from IndexedDB. Paid obligations
 * ride the shared `useObligations()` singleton (same source as the
 * Obligations tab) and are valued through the payments→obligation-amount
 * join in `@/utils/paid-obligations`. All calendar and gap math is
 * delegated to the locked pure helpers in `@/utils/goal-math`.
 *
 * Goal upsert semantics: one row per month. Saving reuses the existing
 * row's UUID when present (so the sync queue's `[entity+entityId]` dedupe
 * replaces the pending op) or creates a fresh row otherwise, then rides the
 * standard optimistic `useOfflineSync().save()` path.
 */
import { v4 as uuidv4 } from 'uuid';
import { computed, ref, watch } from 'vue';

import { useObligations } from '@/composables/useObligations';
import { useOfflineSync } from '@/composables/useOfflineSync';
import { db } from '@/services/idb/db';
import { todayIso } from '@/services/idb/exchangeRates';
import { err, tryAsync, type Result } from '@/types/result';
import {
  daysRemainingInMonth,
  monthlyNetUsdCents,
  remainingToTargetUsdCents,
  requiredPerDayUsdCents as requiredPerDay,
} from '@/utils/goal-math';
import { paidObligationAmountsForMonth } from '@/utils/paid-obligations';

import type { Goal } from '@/types/domain';

/** `YYYY-MM` of an ISO `YYYY-MM-DD` reference (local time). */
export function currentMonthIso(reference: string = todayIso()): string {
  return reference.slice(0, 7);
}

/**
 * Full length of a `YYYY-MM` month — reuses the locked calendar helper
 * (`daysRemainingInMonth` on day 1 always returns the whole month length).
 */
export function daysInMonthIso(month: string): number {
  return daysRemainingInMonth(`${month}-01`);
}

/** Latest-written goal row for a month (legacy duplicates never crash us). */
async function latestGoalFor(month: string): Promise<Goal | null> {
  const rows = await db.goal.where('month').equals(month).toArray();
  const sorted = [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sorted[0] ?? null;
}

export function useGoalAdvisor() {
  const { save } = useOfflineSync();
  const { obligations, payments, refresh: refreshObligations } = useObligations();

  /** Selected viewing/planning month, `YYYY-MM`; defaults to the current. */
  const month = ref(currentMonthIso());
  const loading = ref(false);
  const savingTarget = ref(false);

  /** Target for the selected month in USD cents; null while unset. */
  const targetUsdCents = ref<number | null>(null);
  const saleTotalsUsdCents = ref<number[]>([]);
  const sidePurchaseTotalsUsdCents = ref<number[]>([]);
  const paidObligationTotalsUsdCents = ref<number[]>([]);

  const isCurrentMonth = computed(() => month.value === currentMonthIso());

  const netUsdCents = computed(() =>
    monthlyNetUsdCents(
      saleTotalsUsdCents.value,
      sidePurchaseTotalsUsdCents.value,
      paidObligationTotalsUsdCents.value,
    ),
  );

  /**
   * Days the remaining gap spreads over: a real countdown for the running
   * month; the full month length when planning another month. Always ≥ 1,
   * which `requiredPerDay` requires.
   */
  const planningDays = computed(() =>
    isCurrentMonth.value ? daysRemainingInMonth(todayIso()) : daysInMonthIso(month.value),
  );

  /** Null until a target exists; negative nets widen it, never clamp early. */
  const remainingUsdCents = computed(() =>
    targetUsdCents.value === null
      ? null
      : remainingToTargetUsdCents(targetUsdCents.value, netUsdCents.value),
  );

  const requiredPerDayValue = computed(() =>
    remainingUsdCents.value === null
      ? null
      : requiredPerDay(remainingUsdCents.value, planningDays.value),
  );

  /**
   * Bar fill 0–100. A negative net clamps to 0 on purpose — the bar shows
   * no progress while the negative value itself stays visible as text.
   */
  const progressPercent = computed(() => {
    const target = targetUsdCents.value;
    if (target === null || target <= 0) return 0;
    const percent = (netUsdCents.value / target) * 100;
    if (!Number.isFinite(percent)) return 0;
    return Math.min(100, Math.max(0, percent));
  });

  /** IndexedDB-first load of the selected month's inputs and goal. */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      const prefix = `${month.value}-`;

      const salesResult = await tryAsync(() => db.sale.toArray());
      if (!salesResult.ok) {
        console.error('[goals] sales query failed', { message: salesResult.error.message });
        return;
      }
      const purchasesResult = await tryAsync(() => db.sidePurchase.toArray());
      if (!purchasesResult.ok) {
        console.error('[goals] side purchases query failed', {
          message: purchasesResult.error.message,
        });
        return;
      }
      const goalResult = await tryAsync(() => latestGoalFor(month.value));
      if (!goalResult.ok) {
        console.error('[goals] goal query failed', { message: goalResult.error.message });
        return;
      }

      // Paid obligations come from the shared obligations singleton; its
      // refresh() re-reads both stores and never throws (failures are
      // logged inside the composable).
      await refreshObligations();

      saleTotalsUsdCents.value = salesResult.value
        .filter((sale) => sale.date.startsWith(prefix))
        .map((sale) => sale.totalUsdCents);
      sidePurchaseTotalsUsdCents.value = purchasesResult.value
        .filter((purchase) => purchase.date.startsWith(prefix))
        .map((purchase) => purchase.amountUsdCents);
      paidObligationTotalsUsdCents.value = paidObligationAmountsForMonth(
        obligations.value,
        payments.value,
        month.value,
      );
      targetUsdCents.value = goalResult.value?.targetUsdCents ?? null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Upsert the selected month's target (integer USD cents). Reusing the
   * existing row id keeps queue dedupe intact across rapid edits.
   */
  async function saveTarget(usdCents: number): Promise<Result<void, Error>> {
    if (!Number.isInteger(usdCents) || usdCents <= 0) {
      return err(new RangeError(`useGoalAdvisor.saveTarget: invalid target (${usdCents})`));
    }
    savingTarget.value = true;
    try {
      const existingResult = await tryAsync(() => latestGoalFor(month.value));
      if (!existingResult.ok) {
        console.error('[goals] goal lookup failed', { message: existingResult.error.message });
        return existingResult;
      }

      const nowIso = new Date().toISOString();
      const existing = existingResult.value;
      const row: Goal = existing
        ? { ...existing, targetUsdCents: usdCents, updatedAt: nowIso }
        : {
            id: uuidv4(),
            createdAt: nowIso,
            updatedAt: nowIso,
            month: month.value,
            targetUsdCents: usdCents,
          };

      const result = await save('goal', row);
      if (result.ok) {
        targetUsdCents.value = usdCents;
      } else {
        console.error('[goals] target save failed', {
          month: month.value,
          message: result.error.message,
        });
      }
      return result;
    } finally {
      savingTarget.value = false;
    }
  }

  watch(month, () => {
    void load();
  });
  void load();

  return {
    month,
    loading,
    savingTarget,
    targetUsdCents,
    netUsdCents,
    remainingUsdCents,
    requiredPerDayUsdCents: requiredPerDayValue,
    progressPercent,
    planningDays,
    isCurrentMonth,
    reload: load,
    saveTarget,
  };
}

export type GoalAdvisorApi = ReturnType<typeof useGoalAdvisor>;
