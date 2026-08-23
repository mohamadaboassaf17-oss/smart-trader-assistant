<script setup lang="ts">
/**
 * InvoiceEditor — add a goods invoice for one supplier (PRD §6.3).
 *
 * Total and paid cash are USD-cents inputs (via the shared NumberInput);
 * the remaining debt previews live as `total − paid` and overpayment is
 * blocked. The save rides `useSuppliers().saveInvoice()` (optimistic IDB
 * put → sync queue) and the debt math guard is authoritative there.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import NumberInput from '@/components/NumberInput.vue';
import { useToast } from '@/composables/useToast';
import {
  useSuppliers,
  type SupplierErrorKey,
} from '@/features/suppliers/useSuppliers';
import { todayIso } from '@/services/idb/exchangeRates';
import { computeDebtUsdCents } from '@/utils/invoice-math';
import { formatMoney } from '@/utils/money';

const props = defineProps<{ open: boolean; supplierId?: string | null }>();

const emit = defineEmits<{ saved: []; close: [] }>();

const { t } = useI18n();
const toast = useToast();
const { suppliers, saveInvoice } = useSuppliers();

const dialogRef = ref<HTMLDivElement | null>(null);

const selectedSupplierId = ref('');
const date = ref(todayIso());
const totalCents = ref<number | null>(null);
const paidCents = ref<number | null>(null);
const note = ref('');
const saving = ref(false);

function resetForm(): void {
  selectedSupplierId.value = props.supplierId ?? '';
  date.value = todayIso();
  totalCents.value = null;
  paidCents.value = null;
  note.value = '';
}

const isOverpay = computed(
  () => totalCents.value !== null && paidCents.value !== null && paidCents.value > totalCents.value,
);

/** Live debt preview — only when both amounts parse as valid cents. */
const debtPreview = computed<string | null>(() => {
  const total = totalCents.value;
  const paid = paidCents.value;
  if (total === null || paid === null) return null;
  const debt = computeDebtUsdCents(total, paid);
  return debt.ok ? formatMoney(debt.value, 'USD') : null;
});

const canSave = computed(
  () =>
    !saving.value &&
    selectedSupplierId.value !== '' &&
    date.value !== '' &&
    totalCents.value !== null &&
    totalCents.value > 0 &&
    paidCents.value !== null &&
    paidCents.value >= 0 &&
    !isOverpay.value,
);

/** AuthView-style explicit map — no dynamic i18n keys in templates. */
function errorText(key: SupplierErrorKey): string {
  const map: Record<SupplierErrorKey, string> = {
    'suppliers.invalidName': t('suppliers.invalidName'),
    'suppliers.phoneInvalid': t('suppliers.phoneInvalid'),
    'suppliers.deleteBlocked': t('suppliers.deleteBlocked'),
    'suppliers.invalidAmount': t('suppliers.invalidAmount'),
    'suppliers.overpay': t('suppliers.overpay'),
    unknown: t('common.error'),
  };
  return map[key];
}

async function onKeydown(event: KeyboardEvent): Promise<void> {
  if (event.key === 'Escape') close();
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      resetForm();
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      dialogRef.value?.focus();
    } else {
      window.removeEventListener('keydown', onKeydown);
    }
  },
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function close(): void {
  if (!saving.value) emit('close');
}

async function onSave(): Promise<void> {
  const total = totalCents.value;
  const paid = paidCents.value;
  if (!canSave.value || total === null || paid === null) return;
  saving.value = true;
  try {
    const result = await saveInvoice({
      supplierId: selectedSupplierId.value,
      date: date.value,
      totalUsdCents: total,
      paidCashUsdCents: paid,
      note: note.value.trim() === '' ? undefined : note.value.trim(),
    });
    if (!result.ok) {
      console.error('[suppliers] invoice editor save failed', { key: result.error });
      toast.error(errorText(result.error));
      return;
    }
    toast.success(t('toasts.savedLocally'));
    emit('saved');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ie__overlay" @click.self="close()">
      <div
        ref="dialogRef"
        class="ie__dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        data-testid="invoice-dialog"
        :aria-label="t('suppliers.addInvoice')"
      >
        <header class="ie__header">
          <h2 class="ie__title">{{ t('suppliers.addInvoice') }}</h2>
          <button
            type="button"
            class="ie__close"
            data-testid="invoice-dialog-close"
            :aria-label="t('common.close')"
            @click="close()"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <label class="ie__field">
          <span class="ie__label">{{ t('suppliers.selectSupplier') }}</span>
          <select v-model="selectedSupplierId" class="ie__select" data-testid="invoice-supplier">
            <option value="" disabled>{{ t('suppliers.selectSupplier') }}</option>
            <option v-for="row in suppliers" :key="row.id" :value="row.id">{{ row.name }}</option>
          </select>
        </label>

        <label class="ie__field">
          <span class="ie__label">{{ t('suppliers.invoiceDate') }}</span>
          <input v-model="date" type="date" class="ie__date" data-testid="invoice-date" />
        </label>

        <div class="ie__field" data-testid="invoice-total-wrap">
          <NumberInput
            v-model="totalCents"
            mode="amount"
            :label="t('suppliers.invoiceTotal')"
            placeholder="0.00"
            :disabled="saving"
          />
        </div>

        <div class="ie__field" data-testid="invoice-paid-wrap">
          <NumberInput
            v-model="paidCents"
            mode="amount"
            :label="t('suppliers.paidCash')"
            placeholder="0.00"
            :disabled="saving"
          />
        </div>

        <p v-if="isOverpay" class="ie__error" data-testid="invoice-overpay">
          {{ t('suppliers.overpay') }}
        </p>
        <p v-else-if="debtPreview !== null" class="ie__preview" data-testid="invoice-debt-preview">
          {{ t('suppliers.remainingDebt') }}:
          <strong>{{ debtPreview }}</strong>
        </p>

        <label class="ie__field">
          <span class="ie__label">{{ t('suppliers.noteOptional') }}</span>
          <input
            v-model="note"
            type="text"
            class="ie__note"
            data-testid="invoice-note"
            :disabled="saving"
          />
        </label>

        <div class="ie__actions">
          <button
            type="button"
            class="ie__btn"
            data-testid="invoice-cancel"
            :disabled="saving"
            @click="close()"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="ie__btn ie__btn--primary"
            data-testid="invoice-save"
            :disabled="!canSave"
            @click="onSave"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ie__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
}

.ie__dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  inline-size: 100%;
  max-inline-size: var(--max-width);
  max-block-size: calc(100svh - var(--space-8));
  overflow-block: auto;
  padding: var(--space-5) var(--space-4);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.ie__dialog:focus {
  outline: none;
}

.ie__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ie__title {
  font-size: var(--font-size-lg);
}

.ie__close {
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

.ie__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ie__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.ie__select,
.ie__date,
.ie__note {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

.ie__select:focus,
.ie__date:focus,
.ie__note:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.ie__preview strong {
  color: var(--color-brand-700);
}

.ie__error {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.ie__actions {
  display: flex;
  gap: var(--space-2);
  padding-block-start: var(--space-2);
}

.ie__btn {
  flex: 1;
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-base);
}

.ie__btn--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.ie__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
