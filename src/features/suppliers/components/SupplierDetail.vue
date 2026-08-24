<script setup lang="ts">
/**
 * SupplierDetail — drill-in panel for one supplier (PRD §6.3).
 *
 * Shows the supplier header with its derived outstanding balance (USD
 * only), the invoice history newest-first, a two-step delete per invoice
 * (same pattern as the notes list), and an add-invoice button opening the
 * InvoiceEditor prefilled with this supplier. In-place swaps from the list
 * view — no extra route.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useToast } from '@/composables/useToast';
import { useSuppliers, type SupplierErrorKey } from '@/features/suppliers/useSuppliers';
import { tryAsync } from '@/types/result';
import { formatMoney } from '@/utils/money';

import InvoiceEditor from './InvoiceEditor.vue';

import type { GoodsInvoice, SupplierWithBalance } from '@/types/domain';

const props = defineProps<{ supplier: SupplierWithBalance }>();

const emit = defineEmits<{ back: [] }>();

const { t } = useI18n();
const toast = useToast();
const { invoicesFor, removeInvoice } = useSuppliers();

const invoices = ref<GoodsInvoice[]>([]);
const confirmingDeleteId = ref<string | null>(null);
const removing = ref(false);
const editorOpen = ref(false);

/** Balance is live: the parent re-derives it after every mutation. */
const balanceLabel = computed(() => formatMoney(props.supplier.balanceUsdCents, 'USD'));

async function reload(): Promise<void> {
  const result = await tryAsync(() => invoicesFor(props.supplier.id));
  if (!result.ok) {
    console.error('[suppliers] invoice history query failed', {
      id: props.supplier.id,
      message: result.error.message,
    });
    toast.error(t('common.error'));
    return;
  }
  invoices.value = result.value;
}

watch(
  () => props.supplier.id,
  () => void reload(),
  { immediate: true },
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

async function onConfirmRemove(invoice: GoodsInvoice): Promise<void> {
  if (removing.value) return;
  removing.value = true;
  try {
    const result = await removeInvoice(invoice);
    if (!result.ok) {
      console.error('[suppliers] invoice delete failed', { id: invoice.id, key: result.error });
      toast.error(errorText(result.error));
      return;
    }
    confirmingDeleteId.value = null;
    await reload();
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <section class="sd" data-testid="supplier-detail">
    <button type="button" class="sd__back" data-testid="supplier-back" @click="emit('back')">
      {{ t('suppliers.back') }}
    </button>

    <header class="sd__header">
      <div>
        <h2 class="sd__name" data-testid="supplier-name-header">{{ supplier.name }}</h2>
        <p v-if="supplier.phone" class="sd__phone" dir="ltr" data-testid="supplier-phone-header">
          {{ supplier.phone }}
        </p>
      </div>
      <div class="sd__balance-block">
        <span class="sd__balance-label">{{ t('suppliers.balance') }}</span>
        <strong class="sd__balance" dir="ltr" data-testid="supplier-balance">
          {{ balanceLabel }}
        </strong>
      </div>
    </header>

    <button
      type="button"
      class="sd__add"
      data-testid="supplier-add-invoice"
      @click="editorOpen = true"
    >
      {{ t('suppliers.addInvoice') }}
    </button>

    <h3 class="sd__invoices-title">{{ t('suppliers.invoicesTitle') }}</h3>

    <p v-if="invoices.length === 0" class="sd__empty" data-testid="invoices-empty">
      {{ t('suppliers.noInvoices') }}
    </p>

    <ul v-else class="sd__list" data-testid="invoice-list">
      <li v-for="invoice in invoices" :key="invoice.id" class="sd__row" data-testid="invoice-row">
        <div class="sd__row-head">
          <span class="sd__date" data-testid="invoice-date-cell">{{ invoice.date }}</span>
          <button
            type="button"
            class="sd__link sd__link--danger"
            data-testid="invoice-delete"
            @click="confirmingDeleteId = invoice.id"
          >
            {{ t('common.delete') }}
          </button>
        </div>

        <dl class="sd__grid">
          <div class="sd__cell">
            <dt>{{ t('suppliers.invoiceTotal') }}</dt>
            <dd dir="ltr">{{ formatMoney(invoice.totalUsdCents, 'USD') }}</dd>
          </div>
          <div class="sd__cell">
            <dt>{{ t('suppliers.paidCash') }}</dt>
            <dd dir="ltr">{{ formatMoney(invoice.paidCashUsdCents, 'USD') }}</dd>
          </div>
          <div class="sd__cell sd__cell--debt">
            <dt>{{ t('suppliers.remainingDebt') }}</dt>
            <dd dir="ltr">{{ formatMoney(invoice.debtUsdCents, 'USD') }}</dd>
          </div>
        </dl>

        <p v-if="invoice.note" class="sd__note" data-testid="invoice-note-cell">
          {{ invoice.note }}
        </p>

        <div
          v-if="confirmingDeleteId === invoice.id"
          class="sd__confirm"
          data-testid="invoice-delete-confirm"
        >
          <span class="sd__confirm-text">{{ t('suppliers.deleteConfirm') }}</span>
          <div class="sd__confirm-actions">
            <button
              type="button"
              class="sd__link sd__link--danger"
              data-testid="invoice-confirm-delete"
              :disabled="removing"
              @click="onConfirmRemove(invoice)"
            >
              {{ t('common.confirm') }}
            </button>
            <button
              type="button"
              class="sd__link"
              data-testid="invoice-cancel-delete"
              :disabled="removing"
              @click="confirmingDeleteId = null"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>
      </li>
    </ul>

    <InvoiceEditor
      :open="editorOpen"
      :supplier-id="props.supplier.id"
      @saved="reload()"
      @close="editorOpen = false"
    />
  </section>
</template>

<style scoped>
.sd {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block-end: var(--space-16);
}

.sd__back {
  align-self: start;
  min-inline-size: var(--tap-target-min);
  min-block-size: calc(var(--tap-target-min) - 8px);
  padding-inline: var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.sd__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.sd__name {
  font-size: var(--font-size-xl);
}

.sd__phone {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.sd__balance-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
}

.sd__balance-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.sd__balance {
  color: var(--color-brand-700);
  font-size: var(--font-size-2xl);
}

.sd__add {
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-base);
}

.sd__invoices-title {
  margin-block-start: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.sd__empty {
  padding: var(--space-5) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.sd__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sd__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.sd__row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sd__date {
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.sd__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
}

.sd__cell dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.sd__cell dd {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.sd__cell--debt dd {
  color: var(--color-brand-700);
}

.sd__note {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}

.sd__confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-block-start: var(--space-1);
}

.sd__confirm-text {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.sd__confirm-actions {
  display: flex;
  gap: var(--space-2);
}

.sd__link {
  min-block-size: calc(var(--tap-target-min) - 8px);
  padding-inline: var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.sd__link--danger {
  background: rgb(220 38 38 / 0.1);
  color: var(--color-danger);
}

.sd__link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
