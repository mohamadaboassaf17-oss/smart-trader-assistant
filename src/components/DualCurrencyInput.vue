<script setup lang="ts">
/**
 * DualCurrencyInput — the PRD §6.1 pair: USD cash + local cash.
 * Both values are integer cents; the parent supplies the daily exchange
 * rate and computes totals via `dayTotalUsdCents`.
 */
import { useI18n } from 'vue-i18n';

import NumberInput from '@/components/NumberInput.vue';

defineProps<{
  usdCents: number | null;
  localCents: number | null;
  /** Local currency label, e.g. "ل.ل". */
  localCurrencyLabel: string;
  disabled?: boolean;
}>();

const usd = defineModel<number | null>('usdCents', { default: null });
const local = defineModel<number | null>('localCents', { default: null });

const { t } = useI18n();
</script>

<template>
  <div class="dual-input" role="group">
    <NumberInput
      v-model="usd"
      :label="t('sales.cashUsd')"
      :disabled="disabled"
      placeholder="0.00"
    />
    <NumberInput
      v-model="local"
      :label="t('sales.cashLocal', { local: localCurrencyLabel })"
      :disabled="disabled"
      placeholder="0"
    />
  </div>
</template>

<style scoped>
.dual-input {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}
</style>
