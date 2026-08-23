<script setup lang="ts">
/**
 * QuickSidePurchase — thumb-zone FAB + modal for impulse side purchases
 * (PRD §6.2). One amount, a USD/local toggle and an optional note. Local
 * amounts convert to `amountUsdCents` at save time using the persisted
 * daily rate; the save rides the standard optimistic sync-queue path.
 */
import { v4 as uuidv4 } from 'uuid';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import NumberInput from '@/components/NumberInput.vue';
import { useExchangeRate } from '@/composables/useExchangeRate';
import { useOfflineSync } from '@/composables/useOfflineSync';
import { useToast } from '@/composables/useToast';
import { todayIso } from '@/services/idb/exchangeRates';
import {
  DEFAULT_COUNTRY,
  LOCAL_CURRENCY_BY_COUNTRY,
  LOCAL_CURRENCY_LABEL,
  type LocalCurrencyCode,
} from '@/types/currency';
import { localToUsdCents, formatMoney } from '@/utils/money';

import type { SidePurchase } from '@/types/domain';

const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const { save } = useOfflineSync();
const toast = useToast();

const localCurrency: LocalCurrencyCode = LOCAL_CURRENCY_BY_COUNTRY[DEFAULT_COUNTRY];
const localLabel = LOCAL_CURRENCY_LABEL[LOCAL_CURRENCY_BY_COUNTRY[DEFAULT_COUNTRY]];
const CHOICES = ['USD', localCurrency] as const;
type CurrencyChoice = (typeof CHOICES)[number];

const isOpen = ref(false);
const saving = ref(false);
const amountCents = ref<number | null>(null);
const currencyChoice = ref<CurrencyChoice>(localCurrency);
const note = ref('');

const exchangeRateComposable = useExchangeRate();

const dialogRef = ref<HTMLDivElement | null>(null);

const amountLabel = computed(() =>
  currencyChoice.value === 'USD'
    ? t('purchases.amountUsd')
    : t('purchases.amountLocal', { local: localLabel }),
);

const currencyOptions = computed(() =>
  CHOICES.map((choice) => ({
    value: choice,
    label:
      choice === 'USD'
        ? t('purchases.currencyUsd')
        : t('purchases.currencyLocal', { local: localLabel }),
  })),
);

const convertedUsdCents = computed<number | null>(() => {
  const cents = amountCents.value;
  if (cents === null || cents <= 0) return null;
  if (currencyChoice.value === 'USD') return cents;
  const rate = exchangeRateComposable.rate.value;
  if (!rate || rate <= 0) return null;
  return localToUsdCents(cents, rate);
});

const canSave = computed(
  () => !saving.value && (amountCents.value ?? 0) > 0 && convertedUsdCents.value !== null,
);

function resetForm(): void {
  amountCents.value = null;
  currencyChoice.value = localCurrency;
  note.value = '';
}

async function onKeydown(event: KeyboardEvent): Promise<void> {
  if (event.key === 'Escape') close();
}

watch(isOpen, async (open) => {
  if (open) {
    resetForm();
    window.addEventListener('keydown', onKeydown);
    // IndexedDB-first prefill of today's rate for the conversion preview.
    await exchangeRateComposable.load();
    await nextTick();
    dialogRef.value?.focus();
  } else {
    window.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function close(): void {
  if (!saving.value) isOpen.value = false;
}

async function onSave(): Promise<void> {
  const cents = amountCents.value;
  if (cents === null || cents <= 0) {
    toast.error(t('toasts.invalidAmount'));
    return;
  }

  const knownRate: number | null = exchangeRateComposable.rate.value;
  let effectiveRate: number;
  if (currencyChoice.value === 'USD') {
    // Identity rate — a USD-native purchase required no conversion, but the
    // DB forbids 0 (`exchange_rate > 0`, migration 0003), so store 1.
    effectiveRate = knownRate ?? 1;
  } else if (knownRate !== null && knownRate > 0) {
    effectiveRate = knownRate;
  } else {
    console.error('[purchases] missing daily rate for local conversion');
    toast.error(t('toasts.missingRate'));
    return;
  }

  const nowIso = new Date().toISOString();
  const row: SidePurchase = {
    id: uuidv4(),
    createdAt: nowIso,
    updatedAt: nowIso,
    date: todayIso(),
    amountCents: cents,
    currency: currencyChoice.value,
    exchangeRate: effectiveRate,
    amountUsdCents: currencyChoice.value === 'USD' ? cents : localToUsdCents(cents, effectiveRate),
    note: note.value.trim() === '' ? undefined : note.value.trim(),
  };

  saving.value = true;
  try {
    const result = await save('sidePurchase', row);
    if (!result.ok) {
      console.error('[purchases] side purchase save failed', {
        message: result.error.message,
      });
      toast.error(t('common.error'));
      return;
    }
    toast.success(t('toasts.savedLocally'));
    isOpen.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    class="qsp__fab"
    data-testid="purchase-fab"
    :aria-label="t('purchases.fab')"
    :title="t('purchases.fab')"
    @click="isOpen = true"
  >
    <span aria-hidden="true">＋</span>
  </button>

  <Teleport to="body">
    <div v-if="isOpen" class="qsp__overlay" @click.self="close()">
      <div
        ref="dialogRef"
        class="qsp__dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        data-testid="purchase-dialog"
        :aria-label="t('purchases.modalTitle')"
      >
        <header class="qsp__header">
          <h2 class="qsp__title">{{ t('purchases.modalTitle') }}</h2>
          <button type="button" class="qsp__close" :aria-label="t('common.close')" @click="close()">
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div class="qsp__toggle" role="radiogroup" :aria-label="t('purchases.currencyToggle')">
          <button
            v-for="option in currencyOptions"
            :key="option.value"
            type="button"
            role="radio"
            class="qsp__option"
            :class="{ 'qsp__option--active': currencyChoice === option.value }"
            :aria-checked="currencyChoice === option.value"
            @click="currencyChoice = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <NumberInput v-model="amountCents" mode="amount" :label="amountLabel" placeholder="0.00" />

        <p v-if="convertedUsdCents !== null" class="qsp__preview" data-testid="purchase-preview">
          ≈ <strong>{{ formatMoney(convertedUsdCents, 'USD') }}</strong>
        </p>
        <p v-else-if="currencyChoice !== 'USD'" class="qsp__hint">
          {{ t('purchases.needsRate') }}
        </p>

        <label class="qsp__note">
          <span class="qsp__note-label">{{ t('purchases.noteOptional') }}</span>
          <input
            v-model="note"
            type="text"
            class="qsp__note-field"
            data-testid="purchase-note"
            :placeholder="t('purchases.notePlaceholder')"
          />
        </label>

        <button
          type="button"
          class="qsp__save"
          data-testid="purchase-save"
          :disabled="!canSave"
          @click="onSave"
        >
          {{ t('common.save') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qsp__fab {
  position: fixed;
  inset-block-end: calc(var(--header-height) + var(--space-5));
  inset-inline-end: var(--space-4);
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 56px;
  block-size: 56px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-size: var(--font-size-2xl);
  box-shadow: var(--shadow-lg);
}

.qsp__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
}

.qsp__dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  inline-size: 100%;
  max-inline-size: var(--max-width);
  padding: var(--space-5) var(--space-4);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.qsp__dialog:focus {
  outline: none;
}

.qsp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qsp__title {
  font-size: var(--font-size-lg);
}

.qsp__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--tap-target-min);
  min-block-size: var(--tap-target-min);
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-base);
}

.qsp__toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

.qsp__option {
  min-block-size: calc(var(--tap-target-min) - 8px);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.qsp__option--active {
  background: var(--color-surface);
  color: var(--color-brand-700);
  box-shadow: var(--shadow-sm);
}

.qsp__preview strong {
  color: var(--color-brand-700);
}

.qsp__hint {
  color: var(--color-warning);
  font-size: var(--font-size-sm);
}

.qsp__note {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.qsp__note-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.qsp__note-field {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

.qsp__note-field:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.qsp__save {
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.qsp__save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
