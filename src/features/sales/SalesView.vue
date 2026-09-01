<script setup lang="ts">
/**
 * Daily sales entry — full M4 screen (PRD §6.1).
 *
 * Exactly two cash inputs + the daily rate; totals use the canonical
 * `dayTotalUsdCents` formula. Adds day navigation, a recent-days history
 * strip and editing of an existing day's entry. Saves ride the standard
 * offline-first pipeline: optimistic IDB put → sync queue → ⏳/✅ badge.
 */
import { v4 as uuidv4 } from 'uuid';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import DualCurrencyInput from '@/components/DualCurrencyInput.vue';
import NumberInput from '@/components/NumberInput.vue';
import SyncBadge from '@/components/SyncBadge.vue';
import { useAuth } from '@/composables/useAuth';
import { useExchangeRate } from '@/composables/useExchangeRate';
import { useOfflineSync } from '@/composables/useOfflineSync';
import { useToast } from '@/composables/useToast';
import { saleInsertSchema } from '@/schemas';
import { db } from '@/services/idb/db';
import {
  getLatestRate,
  getRateForDate,
  setRateForDate,
  todayIso,
} from '@/services/idb/exchangeRates';
import { DEFAULT_COUNTRY, LOCAL_CURRENCY_BY_COUNTRY, LOCAL_CURRENCY_LABEL } from '@/types/currency';
import { err, ok, tryAsync, type Result } from '@/types/result';
import { dayTotalUsdCents, formatMoney } from '@/utils/money';

import SalesDayNav from './components/SalesDayNav.vue';
import SalesHistoryList from './components/SalesHistoryList.vue';

import type { Sale } from '@/types/domain';

const HISTORY_LIMIT = 7;

const { t } = useI18n();
const { save } = useOfflineSync();
const toast = useToast();

const { state: authState } = useAuth();
const profileCountry = computed(() => authState.profile?.country ?? null);
const localLabel = computed(
  () =>
    LOCAL_CURRENCY_LABEL[LOCAL_CURRENCY_BY_COUNTRY[authState.profile?.country ?? DEFAULT_COUNTRY]],
);

const today = todayIso();
const selectedDate = ref(today);
const existingEntry = ref<Sale | null>(null);
const recentDays = ref<Sale[]>([]);

const usdCents = ref<number | null>(null);
const localCents = ref<number | null>(null);
const rateInput = ref<number | null>(null);

const loadingDay = ref(false);
const saving = ref(false);
const savedTotalUsdCents = ref<number | null>(null);

const exchangeRateComposable = useExchangeRate(profileCountry);
watch(profileCountry, () => {
  void exchangeRateComposable.load();
});

const isEditing = computed(() => existingEntry.value !== null);

const canSave = computed(
  () =>
    !saving.value &&
    !loadingDay.value &&
    (rateInput.value ?? 0) > 0 &&
    ((usdCents.value ?? 0) > 0 || (localCents.value ?? 0) > 0),
);

const previewTotalUsdCents = computed(() => {
  const rate = rateInput.value;
  if (!rate || rate <= 0) return null;
  return dayTotalUsdCents(usdCents.value ?? 0, localCents.value ?? 0, rate);
});

/**
 * Rate for the day being edited: the persisted row's captured rate wins,
 * then today's composable value (today-or-latest fallback), then any stored
 * per-day rate.
 */
async function resolveRate(date: string, row: Sale | null): Promise<number | null> {
  if (row) return row.exchangeRate;
  if (date === today) {
    await exchangeRateComposable.load();
    return exchangeRateComposable.rate.value;
  }
  const stored = await getRateForDate(date);
  return stored?.rate ?? (await getLatestRate())?.rate ?? null;
}

async function refreshHistory(): Promise<void> {
  const result = await tryAsync(() => db.sale.toArray());
  if (!result.ok) {
    console.error('[sales] history query failed', { message: result.error.message });
    return;
  }
  recentDays.value = [...result.value]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HISTORY_LIMIT);
}

/** IndexedDB-first load of the selected day into the editor. */
async function loadDay(date: string): Promise<void> {
  loadingDay.value = true;
  try {
    const rowsResult = await tryAsync(() => db.sale.where('date').equals(date).toArray());
    if (!rowsResult.ok) {
      console.error('[sales] day query failed', { date, message: rowsResult.error.message });
      toast.error(t('common.error'));
      return;
    }
    // One row per day is expected; if legacy duplicates ever exist for a
    // single day, the most recently updated one wins.
    const rows = [...rowsResult.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const row = rows[0] ?? null;

    existingEntry.value = row;
    usdCents.value = row?.cashUsdCents ?? null;
    localCents.value = row?.cashLocalCents ?? null;
    savedTotalUsdCents.value = row?.totalUsdCents ?? null;

    const rateResult = await tryAsync(() => resolveRate(date, row));
    if (!rateResult.ok) {
      console.error('[sales] rate lookup failed', { date, message: rateResult.error.message });
      rateInput.value = null;
    } else {
      rateInput.value = rateResult.value;
    }

    await refreshHistory();
  } finally {
    loadingDay.value = false;
  }
}

watch(selectedDate, (date) => {
  void loadDay(date);
});
void loadDay(today);

// ── M7 timing instrumentation: measures time-to-input for the 3-min target (PRD §8) ──
if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
  performance.mark('sales-view-mounted');
  try {
    sessionStorage.setItem('sales-entry-start', String(Date.now()));
  } catch (e) {
    console.warn('[SalesView] storage failed', e);
    toast.error(t('toasts.storageError'));
  }
}

/** Persist the daily rate: composable path for today, direct store otherwise. */
async function persistRate(date: string, rate: number): Promise<Result<void, Error>> {
  if (date === today) {
    const savedToday = await exchangeRateComposable.save(rate);
    return savedToday ? ok(undefined) : err(new Error(`useExchangeRate.save failed (${date})`));
  }
  return tryAsync(() => setRateForDate(date, rate));
}

async function onSave(): Promise<void> {
  const rate = rateInput.value;
  if (!canSave.value || rate === null || rate <= 0) return;
  saving.value = true;
  try {
    const rateSaved = await persistRate(selectedDate.value, rate);
    if (!rateSaved.ok) {
      console.error('[sales] rate persistence failed', {
        date: selectedDate.value,
        message: rateSaved.error.message,
      });
      toast.error(t('common.error'));
      return;
    }
    const nowIso = new Date().toISOString();
    // Central Zod validation before calculation (P1.5) — amount + rate
    const fields = {
      date: selectedDate.value,
      cashUsdCents: usdCents.value ?? 0,
      cashLocalCents: localCents.value ?? 0,
      exchangeRate: rate,
      totalUsdCents: dayTotalUsdCents(usdCents.value ?? 0, localCents.value ?? 0, rate),
    };
    const saleParsed = saleInsertSchema.safeParse(fields);
    if (!saleParsed.success) {
      console.error('[sales] validation failed', saleParsed.error.issues);
      toast.error(t('toasts.invalidAmount'));
      return;
    }
    const row: Sale = existingEntry.value
      ? { ...existingEntry.value, ...fields, updatedAt: nowIso }
      : { id: uuidv4(), createdAt: nowIso, updatedAt: nowIso, ...fields };

    const result = await save('sale', row);
    if (result.ok) {
      existingEntry.value = row;
      savedTotalUsdCents.value = row.totalUsdCents;
      // M7: log entry duration for the <3 min target; stored for E2E assertion
      if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        try {
          performance.mark('sales-entry-saved');
          const startRaw = sessionStorage.getItem('sales-entry-start');
          const start = startRaw ? Number(startRaw) : Date.now();
          const durationSec = (Date.now() - start) / 1000;
          console.info('[perf] sales entry duration', {
            date: selectedDate.value,
            durationSec: Math.round(durationSec),
            withinTarget: durationSec < 180,
          });
          (
            window as unknown as { __SALES_ENTRY_DURATION_SEC?: number }
          ).__SALES_ENTRY_DURATION_SEC = durationSec;
        } catch (e) {
          console.warn('[SalesView] storage failed', e);
          toast.error(t('toasts.storageError'));
        }
      }
      toast.success(t('toasts.savedLocally'));
      await refreshHistory();
    } else {
      console.error('[sales] save failed', {
        date: selectedDate.value,
        message: result.error.message,
      });
      toast.error(t('common.error'));
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="sales">
    <SalesDayNav v-model:date="selectedDate" :disabled="saving" />

    <div class="sales__card">
      <p v-if="isEditing" class="sales__editing" data-testid="sales-editing">
        {{ t('sales.editingDay') }}
      </p>

      <DualCurrencyInput
        v-model:usd-cents="usdCents"
        v-model:local-cents="localCents"
        :local-currency-label="localLabel"
        :disabled="saving || loadingDay"
      />

      <NumberInput
        v-model="rateInput"
        mode="plain"
        :label="t('sales.rate')"
        placeholder="89500"
        :disabled="saving || loadingDay"
      />

      <p
        v-if="previewTotalUsdCents !== null"
        class="sales__total"
        data-testid="sales-total-preview"
      >
        {{ t('sales.totalUsd') }}:
        <strong>{{ formatMoney(previewTotalUsdCents, 'USD') }}</strong>
      </p>

      <p class="sales__status" data-testid="sales-status">
        <SyncBadge />
        <span v-if="savedTotalUsdCents !== null" data-testid="sales-saved-total">
          {{ t('sales.savedAmount', { total: formatMoney(savedTotalUsdCents, 'USD') }) }}
        </span>
      </p>

      <button
        type="button"
        class="sales__save"
        data-testid="sales-save"
        :disabled="!canSave"
        @click="onSave"
      >
        {{ isEditing ? t('sales.updateEntry') : t('common.save') }}
      </button>
    </div>

    <SalesHistoryList
      :days="recentDays"
      :selected-date="selectedDate"
      @select="selectedDate = $event"
    />
  </section>
</template>

<style scoped>
.sales {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sales__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-4);
  padding-block-end: var(--space-10);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.sales__editing {
  padding-inline: var(--space-3);
  padding-block: var(--space-2);
  border-radius: var(--radius-md);
  background: rgb(217 119 6 / 0.12);
  color: var(--color-warning);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.sales__total {
  font-size: var(--font-size-base);
}

.sales__total strong {
  font-size: var(--font-size-xl);
  color: var(--color-brand-700);
}

.sales__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.sales__save {
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
  margin-block-start: auto;
}

.sales__save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
