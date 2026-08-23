<script setup lang="ts">
/**
 * SalesHistoryList — compact recent-days strip with USD totals; tapping a
 * day loads it into the editor above (PRD §6.1 day review).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { formatDayLabel } from '@/composables/useDayFormat';
import { formatMoney } from '@/utils/money';

import type { Sale } from '@/types/domain';

const props = defineProps<{
  days: Sale[];
  selectedDate: string;
}>();

const emit = defineEmits<{ select: [date: string] }>();

const { t } = useI18n();

const rows = computed(() =>
  props.days.map((day) => ({
    id: day.id,
    date: day.date,
    label: formatDayLabel(day.date),
    total: formatMoney(day.totalUsdCents, 'USD'),
  })),
);
</script>

<template>
  <section class="history">
    <h2 class="history__title">{{ t('sales.historyTitle') }}</h2>

    <p v-if="rows.length === 0" class="history__empty" data-testid="sales-history-empty">
      {{ t('sales.noHistory') }}
    </p>

    <ul v-else class="history__list" data-testid="sales-history">
      <li v-for="row in rows" :key="row.id">
        <button
          type="button"
          class="history__item"
          :class="{ 'history__item--active': row.date === props.selectedDate }"
          @click="emit('select', row.date)"
        >
          <span class="history__day">{{ row.label }}</span>
          <span class="history__total">{{ row.total }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.history__title {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.history__empty {
  padding: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.history__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.history__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  inline-size: 100%;
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  text-align: start;
}

.history__item--active {
  border-color: var(--color-brand-600);
  background: var(--color-brand-50);
}

.history__day {
  font-size: var(--font-size-sm);
}

.history__total {
  font-weight: 700;
  font-size: var(--font-size-base);
  color: var(--color-brand-700);
}
</style>
