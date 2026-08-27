<script setup lang="ts">
/**
 * Obligations screen — M6.
 *
 * Local-first: on mount `ensurePendingRows()` materializes this month's
 * pending payment rows, then both stores are read. Section 1 lists the
 * current month's payments (name, amount, due-day chip, ⏳/✅ status) with
 * a thumb-zone pay action; below sit obligation management (add/edit/delete
 * with a two-step inline confirm) and a flat history of past paid months.
 * Failures surface as Arabic toasts.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useObligations, type ObligationErrorKey } from '@/composables/useObligations';
import { useToast } from '@/composables/useToast';
import { formatMoney } from '@/utils/money';
import { currentMonthKey } from '@/utils/obligation-schedule';

import ObligationEditor from './components/ObligationEditor.vue';

import type { Obligation, ObligationPayment } from '@/types/domain';

const { t } = useI18n();
const toast = useToast();
const { obligations, payments, refresh, ensurePendingRows, removeObligation, markPaid } =
  useObligations();

/** Frozen at mount: generation + grouping are per-month by design. */
const monthKey = currentMonthKey();

onMounted(async () => {
  await ensurePendingRows();
  await refresh();
});

// ── Current-month list ──────────────────────────────────────────────────────
interface PaymentRowVm {
  payment: ObligationPayment;
  obligation: Obligation | undefined;
}

const currentList = computed<PaymentRowVm[]>(() =>
  payments.value
    .filter((row) => row.month === monthKey)
    .map((payment) => ({
      payment,
      obligation: obligations.value.find((row) => row.id === payment.obligationId),
    }))
    .sort(
      (a, b) =>
        (a.obligation?.dueDay ?? 99) - (b.obligation?.dueDay ?? 99) ||
        (a.obligation?.name ?? '').localeCompare(b.obligation?.name ?? ''),
    ),
);

const paying = ref(false);

async function onPay(entry: PaymentRowVm): Promise<void> {
  if (paying.value || entry.payment.status === 'paid') return;
  paying.value = true;
  try {
    const result = await markPaid(entry.payment);
    if (!result.ok) {
      console.error('[obligations] pay failed', {
        id: entry.payment.id,
        message: result.error.message,
      });
      toast.error(t('common.error'));
      return;
    }
    toast.success(t('obligations.paidToast'));
  } finally {
    paying.value = false;
  }
}

// ── Past months' paid history ───────────────────────────────────────────────
const history = computed(() =>
  payments.value
    .filter((row) => row.month < monthKey && row.status === 'paid')
    .map((payment) => ({
      payment,
      obligation: obligations.value.find((row) => row.id === payment.obligationId),
    }))
    .filter((entry) => entry.obligation !== undefined),
);

// ── Editor wiring ───────────────────────────────────────────────────────────
const editorOpen = ref(false);
const editTarget = ref<Obligation | null>(null);

function openAdd(): void {
  editTarget.value = null;
  editorOpen.value = true;
}

function openEdit(obligation: Obligation): void {
  editTarget.value = obligation;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
}

// ── Delete (two-step confirm; cascades the payment rows) ────────────────────
const confirmingDeleteId = ref<string | null>(null);
const deleting = ref(false);

/** AuthView-style explicit map — no dynamic i18n keys in templates. */
function errorText(key: ObligationErrorKey): string {
  const map: Record<ObligationErrorKey, string> = {
    'obligations.invalidName': t('obligations.invalidName'),
    'obligations.invalidAmount': t('obligations.invalidAmount'),
    'obligations.invalidDueDay': t('obligations.invalidDueDay'),
    unknown: t('common.error'),
  };
  return map[key];
}

async function onConfirmRemove(obligation: Obligation): Promise<void> {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const result = await removeObligation(obligation);
    if (!result.ok) {
      console.error('[obligations] delete failed', { id: obligation.id, key: result.error });
      toast.error(errorText(result.error));
      return;
    }
    confirmingDeleteId.value = null;
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <section class="ov">
    <h2 class="ov__heading">{{ t('obligations.monthly') }}</h2>

    <p
      v-if="payments.length === 0 && obligations.length === 0"
      class="ov__empty"
      data-testid="obligations-empty"
    >
      {{ t('obligations.emptyList') }}
    </p>

    <ul v-else-if="currentList.length > 0" class="ov__list" data-testid="payment-list">
      <li
        v-for="entry in currentList"
        :key="entry.payment.id"
        class="ov__card"
        data-testid="payment-row"
      >
        <div class="ov__main">
          <span class="ov__name" data-testid="payment-name">{{ entry.obligation?.name }}</span>
          <span class="ov__amount" dir="ltr" data-testid="payment-amount">
            {{ formatMoney(entry.obligation?.amountUsdCents ?? 0, 'USD') }}
          </span>
        </div>
        <div class="ov__main">
          <div class="ov__meta">
            <span class="ov__chip" data-testid="payment-due-day">
              {{ t('obligations.dueDayChip', { day: entry.obligation?.dueDay ?? 0 }) }}
            </span>
            <span
              class="ov__badge"
              :class="{ 'ov__badge--paid': entry.payment.status === 'paid' }"
              data-testid="payment-status"
            >
              {{
                entry.payment.status === 'paid'
                  ? `✅ ${t('obligations.statusPaid')}`
                  : `⏳ ${t('obligations.statusPending')}`
              }}
            </span>
          </div>
          <button
            type="button"
            class="ov__btn ov__btn--primary"
            data-testid="payment-pay"
            :aria-label="t('obligations.markPaid')"
            :disabled="entry.payment.status === 'paid' || paying"
            @click="onPay(entry)"
          >
            {{ t('obligations.markPaid') }}
          </button>
        </div>
      </li>
    </ul>

    <template v-if="obligations.length > 0">
      <h2 class="ov__heading">{{ t('obligations.manageTitle') }}</h2>

      <ul class="ov__list" data-testid="obligation-list">
        <li v-for="row in obligations" :key="row.id" class="ov__card" data-testid="obligation-row">
          <div v-if="confirmingDeleteId === row.id" class="ov__confirm">
            <span class="ov__confirm-text" data-testid="obligation-delete-confirm">
              {{ t('obligations.deleteConfirm') }}
            </span>
            <div class="ov__actions">
              <button
                type="button"
                class="ov__btn ov__btn--danger"
                data-testid="obligation-confirm-delete"
                :disabled="deleting"
                @click="onConfirmRemove(row)"
              >
                {{ t('common.confirm') }}
              </button>
              <button
                type="button"
                class="ov__btn"
                data-testid="obligation-cancel-delete"
                :disabled="deleting"
                @click="confirmingDeleteId = null"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>

          <template v-else>
            <div class="ov__main">
              <span class="ov__name" data-testid="obligation-name-cell">{{ row.name }}</span>
              <span
                class="ov__chip"
                :class="{ 'ov__chip--muted': !row.active }"
                data-testid="obligation-active-badge"
              >
                {{ row.active ? t('obligations.active') : t('obligations.inactive') }}
              </span>
            </div>
            <div class="ov__actions">
              <button
                type="button"
                class="ov__btn"
                data-testid="obligation-edit"
                @click="openEdit(row)"
              >
                {{ t('common.edit') }}
              </button>
              <button
                type="button"
                class="ov__btn ov__btn--danger"
                data-testid="obligation-delete"
                @click="confirmingDeleteId = row.id"
              >
                {{ t('common.delete') }}
              </button>
            </div>
          </template>
        </li>
      </ul>
    </template>

    <template v-if="history.length > 0">
      <h2 class="ov__heading">{{ t('obligations.historyTitle') }}</h2>

      <ul class="ov__list" data-testid="history-list">
        <li
          v-for="entry in history"
          :key="entry.payment.id"
          class="ov__history-row"
          data-testid="history-row"
        >
          <span dir="ltr" data-testid="history-month">{{ entry.payment.month }}</span>
          <span class="ov__name">{{ entry.obligation?.name }}</span>
          <span dir="ltr" data-testid="history-amount">
            {{ formatMoney(entry.obligation?.amountUsdCents ?? 0, 'USD') }}
          </span>
        </li>
      </ul>
    </template>
    <p v-else class="ov__no-history" data-testid="no-history">{{ t('obligations.noHistory') }}</p>

    <button
      type="button"
      class="ov__fab"
      data-testid="obligation-fab"
      :aria-label="t('obligations.addObligation')"
      :title="t('obligations.addObligation')"
      @click="openAdd()"
    >
      <span aria-hidden="true">＋</span>
    </button>

    <ObligationEditor
      :open="editorOpen"
      :obligation="editTarget"
      @saved="closeEditor()"
      @close="closeEditor()"
    />
  </section>
</template>

<style scoped>
.ov {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ov__heading {
  margin-block-start: var(--space-2);
  font-size: var(--font-size-base);
  font-weight: 700;
}

.ov__empty,
.ov__no-history {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.ov__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ov__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.ov__history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  box-shadow: var(--shadow-sm);
}

.ov__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.ov__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.ov__amount {
  flex-shrink: 0;
  font-weight: 600;
}

.ov__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.ov__chip {
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.ov__chip--muted {
  opacity: 0.7;
}

.ov__badge {
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  border-radius: var(--radius-full);
  background: rgb(217 119 6 / 0.12);
  color: var(--color-warning);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.ov__badge--paid {
  background: rgb(22 163 74 / 0.12);
  color: var(--color-success);
}

.ov__confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.ov__confirm-text {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.ov__actions {
  display: flex;
  gap: var(--space-2);
}

.ov__btn {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.ov__btn--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
}

.ov__btn--danger {
  background: rgb(220 38 38 / 0.1);
  color: var(--color-danger);
}

.ov__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ov__fab {
  position: fixed;
  inset-block-end: calc(var(--header-height) + var(--space-5) + env(safe-area-inset-bottom, 0px));
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
</style>
