<script setup lang="ts">
/**
 * SalesDayNav — prev/next arrows + native date picker for reviewing past
 * days (PRD §6.1). Arrows are decorative glyphs; direction meaning comes
 * from the RTL layout (prev renders on the inline-start side).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { addDaysIso, formatDayLabel } from '@/composables/useDayFormat';
import { todayIso } from '@/services/idb/exchangeRates';

const props = defineProps<{
  /** Selected business day, `YYYY-MM-DD`. */
  date: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:date': [value: string] }>();

const { t } = useI18n();

const today = todayIso();

const prevDate = computed(() => addDaysIso(props.date, -1));
const nextDate = computed(() => addDaysIso(props.date, 1));
const canGoNext = computed(() => nextDate.value <= today);
const dayLabel = computed(() => formatDayLabel(props.date));

function onPick(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (value === '' || value === props.date) return;
  emit('update:date', value);
}
</script>

<template>
  <div class="day-nav" role="group" :aria-label="t('sales.pickDay')">
    <button
      type="button"
      class="day-nav__arrow"
      data-testid="sales-prev-day"
      :aria-label="t('sales.prevDay')"
      :title="t('sales.prevDay')"
      :disabled="props.disabled"
      @click="emit('update:date', prevDate)"
    >
      <span aria-hidden="true">›</span>
    </button>

    <div class="day-nav__center">
      <span class="day-nav__label" data-testid="sales-day-label">{{ dayLabel }}</span>
      <input
        class="day-nav__picker"
        type="date"
        dir="ltr"
        data-testid="sales-date"
        :value="props.date"
        :max="today"
        :aria-label="t('sales.pickDay')"
        :disabled="props.disabled"
        @change="onPick"
      />
    </div>

    <button
      type="button"
      class="day-nav__arrow"
      data-testid="sales-next-day"
      :aria-label="t('sales.nextDay')"
      :title="t('sales.nextDay')"
      :disabled="props.disabled || !canGoNext"
      @click="emit('update:date', nextDate)"
    >
      <span aria-hidden="true">‹</span>
    </button>
  </div>
</template>

<style scoped>
.day-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.day-nav__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--tap-target-min);
  min-block-size: var(--tap-target-min);
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-brand-700);
  font-size: var(--font-size-2xl);
  line-height: 1;
}

.day-nav__arrow:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.day-nav__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-inline-size: 0;
}

.day-nav__label {
  font-weight: 700;
  font-size: var(--font-size-base);
  white-space: nowrap;
}

.day-nav__picker {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
</style>
