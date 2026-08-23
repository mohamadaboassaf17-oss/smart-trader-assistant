<script setup lang="ts">
/**
 * <OnboardingView> — PRD §5 wizard:
 *   1. pick country (لبنان / سوريا)
 *   2. confirm the derived local currency → creates the trial profile.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import { useAuth } from '@/composables/useAuth';
import { useToast } from '@/composables/useToast';
import { COUNTRIES, LOCAL_CURRENCY_BY_COUNTRY, LOCAL_CURRENCY_LABEL } from '@/types/currency';

import type { CountryCode } from '@/types/currency';

const { t } = useI18n();
const router = useRouter();
const auth = useAuth();
const toast = useToast();

const country = ref<CountryCode | null>(null);
const submitting = ref(false);

const derivedCurrency = computed(() =>
  country.value ? LOCAL_CURRENCY_LABEL[LOCAL_CURRENCY_BY_COUNTRY[country.value]] : null,
);

function pick(code: CountryCode): void {
  country.value = code;
}

async function onConfirm(): Promise<void> {
  if (!country.value || submitting.value) return;
  submitting.value = true;
  try {
    const result = await auth.completeOnboarding(country.value);
    if (!result.ok) {
      console.error('[onboarding] failed', result.error);
      toast.error(t('common.error'));
      return;
    }
    toast.success(t('onboarding.done'));
    await router.push('/');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="ob">
    <header class="ob__head" role="banner">
      <h1 class="ob__title">{{ t('onboarding.welcome') }}</h1>
      <p class="ob__hint">{{ t('onboarding.pickCountry') }}</p>
    </header>

    <main class="ob__body">
      <div class="ob__countries" role="radiogroup" :aria-label="t('onboarding.pickCountry')">
        <button
          v-for="code in COUNTRIES"
          :key="code"
          type="button"
          role="radio"
          class="ob__country"
          :class="{ 'ob__country--selected': country === code }"
          :aria-checked="country === code"
          :data-testid="`ob-country-${code.toLowerCase()}`"
          @click="pick(code)"
        >
          <span class="ob__flag" aria-hidden="true">{{ code === 'LB' ? '🇱🇧' : '🇸🇾' }}</span>
          <span class="ob__name">{{ t(`onboarding.${code === 'LB' ? 'lebanon' : 'syria'}`) }}</span>
          <span class="ob__currency">
            {{ LOCAL_CURRENCY_LABEL[LOCAL_CURRENCY_BY_COUNTRY[code]] }}
          </span>
        </button>
      </div>

      <p v-if="derivedCurrency" class="ob__summary" data-testid="ob-currency-summary">
        {{ t('onboarding.currencySet', { currency: derivedCurrency }) }}
      </p>

      <button
        type="button"
        class="ob__confirm"
        data-testid="ob-confirm"
        :disabled="!country || submitting"
        @click="onConfirm"
      >
        {{ t('onboarding.start') }}
      </button>
    </main>
  </div>
</template>

<style scoped>
.ob {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  padding: var(--space-4);
}

.ob__head {
  text-align: center;
}

.ob__title {
  font-size: var(--font-size-2xl);
  color: var(--color-brand-700);
}

.ob__hint {
  color: var(--color-text-muted);
}

.ob__body {
  width: 100%;
  max-width: var(--max-width);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ob__countries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.ob__country {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-5) var(--space-3);
  min-block-size: calc(var(--tap-target-min) * 2);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.ob__country--selected {
  border-color: var(--color-brand-600);
  background: var(--color-brand-50);
}

.ob__flag {
  font-size: var(--font-size-3xl);
}

.ob__name {
  font-weight: 700;
}

.ob__currency {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.ob__summary {
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.ob__confirm {
  min-block-size: calc(var(--tap-target-min) + 8px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.ob__confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
