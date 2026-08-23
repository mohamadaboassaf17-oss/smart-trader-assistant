<script setup lang="ts">
/**
 * Goal advisor screen (PRD §6.8) — M4.
 *
 * Monthly USD target setter (stored as integer cents, one row per month,
 * upsert semantics) plus interactive progress: net = sales − side purchases
 * for the selected month, remaining gap and required-per-day. Negative nets
 * are legitimate: the bar stays at zero while the negative value shows as
 * text. All math lives in `useGoalAdvisor`; the template only renders.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import NumberInput from '@/components/NumberInput.vue';
import { useGoalAdvisor } from '@/composables/useGoalAdvisor';
import { useToast } from '@/composables/useToast';
import { formatMoney } from '@/utils/money';

import GoalProgressBar from './components/GoalProgressBar.vue';

const { t } = useI18n();
const toast = useToast();

const {
  month,
  loading,
  savingTarget,
  targetUsdCents,
  netUsdCents,
  remainingUsdCents,
  requiredPerDayUsdCents,
  progressPercent,
  planningDays,
  saveTarget,
} = useGoalAdvisor();

/** Editor state, separate from the stored target until saved. */
const targetInputCents = ref<number | null>(null);

// Echo the loaded/persisted target into the editor (NumberInput ignores
// model changes while the user is typing).
watch(
  targetUsdCents,
  (cents) => {
    if (cents !== null) targetInputCents.value = cents;
  },
  { immediate: true },
);

const canSaveTarget = computed(
  () => !savingTarget.value && !loading.value && (targetInputCents.value ?? 0) > 0,
);

const hasTarget = computed(() => targetUsdCents.value !== null);

const netLine = computed(() => {
  const target = targetUsdCents.value;
  if (target === null) return '';
  return t('goals.netOfTarget', {
    net: formatMoney(netUsdCents.value, 'USD'),
    target: formatMoney(target, 'USD'),
  });
});

const remainingLine = computed(() => {
  const remaining = remainingUsdCents.value;
  if (remaining === null || remaining <= 0) return null;
  return t('goals.remaining', { amount: formatMoney(remaining, 'USD') });
});

const requiredLine = computed(() => {
  const perDay = requiredPerDayUsdCents.value;
  if (perDay === null) return null;
  return `${formatMoney(perDay, 'USD')} — ${t('goals.daysLeft', { days: planningDays.value })}`;
});

const isTargetMet = computed(() => {
  const target = targetUsdCents.value;
  return target !== null && netUsdCents.value >= target;
});

const isNegativeNet = computed(() => netUsdCents.value < 0);

async function onSaveTarget(): Promise<void> {
  const cents = targetInputCents.value;
  if (cents === null || cents <= 0) {
    toast.error(t('toasts.invalidAmount'));
    return;
  }
  const result = await saveTarget(cents);
  if (!result.ok) {
    toast.error(t('common.error'));
    return;
  }
  toast.success(t('toasts.savedLocally'));
}
</script>

<template>
  <section class="goals">
    <div class="goals__card">
      <label class="goals__field">
        <span class="goals__label">{{ t('goals.month') }}</span>
        <input v-model="month" type="month" class="goals__month" data-testid="goal-month" />
      </label>

      <NumberInput
        v-model="targetInputCents"
        mode="amount"
        :label="t('goals.target')"
        placeholder="2000.00"
        :disabled="loading || savingTarget"
      />

      <button
        type="button"
        class="goals__save"
        data-testid="goal-save-target"
        :disabled="!canSaveTarget"
        @click="onSaveTarget"
      >
        {{ t('common.save') }}
      </button>
    </div>

    <div v-if="hasTarget" class="goals__card" data-testid="goal-progress-card">
      <p class="goals__net" data-testid="goal-net">{{ netLine }}</p>

      <GoalProgressBar :percent="progressPercent" :label="t('goals.progress')" />

      <p v-if="remainingLine" class="goals__line" data-testid="goal-remaining">
        {{ remainingLine }}
      </p>

      <p class="goals__line" data-testid="goal-required">
        {{ t('goals.requiredPerDay') }}: {{ requiredLine }}
      </p>

      <p v-if="isTargetMet" class="goals__met" data-testid="goal-met">
        {{ t('goals.targetMet') }}
      </p>
      <p v-else-if="isNegativeNet" class="goals__loss" data-testid="goal-loss">
        {{ t('goals.negativeNet') }}
      </p>
    </div>

    <p v-else class="goals__hint" data-testid="goal-no-target">{{ t('goals.noTarget') }}</p>
  </section>
</template>

<style scoped>
.goals {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block-end: var(--space-16);
}

.goals__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.goals__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.goals__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.goals__month {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

.goals__month:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.goals__save {
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.goals__save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.goals__net {
  font-size: var(--font-size-base);
  font-weight: 600;
}

.goals__line {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.goals__met {
  padding-inline: var(--space-3);
  padding-block: var(--space-2);
  border-radius: var(--radius-md);
  background: rgb(22 163 74 / 0.12);
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.goals__loss {
  padding-inline: var(--space-3);
  padding-block: var(--space-2);
  border-radius: var(--radius-md);
  background: rgb(220 38 38 / 0.1);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.goals__hint {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
</style>
