<script setup lang="ts">
/**
 * Side purchases screen (PRD §6.2) — M4.
 *
 * Hosts the thumb-zone <QuickSidePurchase> FAB and lists today's/recent
 * side purchases. Reads are IndexedDB-first; saves arrive via the modal's
 * optimistic queue path and refresh this list through the `saved` event.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { formatDayLabel } from '@/composables/useDayFormat';
import { useToast } from '@/composables/useToast';
import QuickSidePurchase from '@/features/purchases/components/QuickSidePurchase.vue';
import { db } from '@/services/idb/db';
import { todayIso } from '@/services/idb/exchangeRates';
import { tryAsync } from '@/types/result';
import { formatMoney } from '@/utils/money';

import type { SidePurchase } from '@/types/domain';

const RECENT_LIMIT = 10;

const { t } = useI18n();
const toast = useToast();

const purchases = ref<SidePurchase[]>([]);
const today = todayIso();

interface PurchaseRow {
  id: string;
  label: string;
  isToday: boolean;
  primary: string;
  secondary: string | null;
  note: string | null;
}

const rows = computed<PurchaseRow[]>(() =>
  purchases.value.map((purchase) => ({
    id: purchase.id,
    label: formatDayLabel(purchase.date),
    isToday: purchase.date === today,
    primary: formatMoney(purchase.amountCents, purchase.currency),
    secondary: purchase.currency === 'USD' ? null : formatMoney(purchase.amountUsdCents, 'USD'),
    note: purchase.note ?? null,
  })),
);

async function refresh(): Promise<void> {
  const result = await tryAsync(() => db.sidePurchase.toArray());
  if (!result.ok) {
    console.error('[purchases] list query failed', { message: result.error.message });
    toast.error(t('common.error'));
    return;
  }
  purchases.value = [...result.value]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <section class="purchases">
    <h2 class="purchases__title">{{ t('purchases.recentTitle') }}</h2>

    <p v-if="rows.length === 0" class="purchases__empty" data-testid="purchases-empty">
      {{ t('purchases.emptyList') }}
    </p>

    <ul v-else class="purchases__list" data-testid="purchases-list">
      <li v-for="row in rows" :key="row.id" class="purchases__item">
        <div class="purchases__meta">
          <span class="purchases__day">{{ row.isToday ? t('common.today') : row.label }}</span>
          <span v-if="row.note" class="purchases__note">{{ row.note }}</span>
        </div>
        <div class="purchases__amounts">
          <strong class="purchases__primary">{{ row.primary }}</strong>
          <span v-if="row.secondary" class="purchases__secondary">{{ row.secondary }}</span>
        </div>
      </li>
    </ul>

    <QuickSidePurchase @saved="refresh()" />
  </section>
</template>

<style scoped>
.purchases {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block-end: var(--space-16);
}

.purchases__title {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.purchases__empty {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.purchases__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.purchases__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-inline: var(--space-3);
  padding-block: var(--space-2);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.purchases__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-inline-size: 0;
}

.purchases__day {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.purchases__note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
}

.purchases__amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
}

.purchases__primary {
  font-size: var(--font-size-base);
}

.purchases__secondary {
  color: var(--color-brand-700);
  font-size: var(--font-size-xs);
}
</style>
