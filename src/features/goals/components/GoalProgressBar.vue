<script setup lang="ts">
/**
 * GoalProgressBar — RTL-safe interactive progress bar (PRD §6.8).
 *
 * Purely presentational: receives a 0–100 percent (clamped defensively).
 * The fill grows from the inline-start edge using logical CSS only, so it
 * mirrors correctly under `dir="rtl"` with no directional hacks.
 */
import { computed } from 'vue';

const props = defineProps<{
  /** Fill percentage 0–100; out-of-range values are clamped. */
  percent: number;
  /** Accessible name for the progressbar role. */
  label: string;
}>();

const safePercent = computed(() => Math.min(100, Math.max(0, props.percent)));
const ariaNow = computed(() => Math.round(safePercent.value));
const fillStyle = computed(() => ({ inlineSize: `${safePercent.value}%` }));
</script>

<template>
  <div
    class="gpb"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="ariaNow"
    aria-valuemin="0"
    aria-valuemax="100"
    data-testid="goal-progress-bar"
  >
    <div class="gpb__fill" :style="fillStyle"></div>
  </div>
</template>

<style scoped>
.gpb {
  block-size: 14px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  box-shadow: inset 0 1px 1px rgb(15 23 42 / 0.06);
}

.gpb__fill {
  block-size: 100%;
  border-radius: inherit;
  background: var(--color-brand-600);
  transition: inline-size 300ms ease;
}
</style>
