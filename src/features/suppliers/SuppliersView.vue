<script setup lang="ts">
/**
 * Suppliers screen (PRD §6.3) — M5.
 *
 * Local-first list ordered by outstanding balance (derived from goods
 * invoices, never stored), substring search by name/phone, add/edit/delete
 * riding the standard optimistic sync-queue path, and an in-view drill-in
 * detail panel — no extra route. Failures surface as Arabic toasts.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useToast } from '@/composables/useToast';
import {
  useSuppliers,
  type SupplierErrorKey,
} from '@/features/suppliers/useSuppliers';
import { formatMoney } from '@/utils/money';

import SupplierDetail from './components/SupplierDetail.vue';
import SupplierEditor from './components/SupplierEditor.vue';

import type { Supplier } from '@/types/domain';

const { t } = useI18n();
const toast = useToast();
const { suppliers, refresh, removeSupplier } = useSuppliers();

onMounted(() => {
  void refresh();
});

// ── Search ──────────────────────────────────────────────────────────────────
const query = ref('');

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (needle === '') return suppliers.value;
  return suppliers.value.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) ||
      (row.phone ?? '').toLowerCase().includes(needle),
  );
});

// ── Detail swap ─────────────────────────────────────────────────────────────
const selectedId = ref<string | null>(null);
const selected = computed(() => suppliers.value.find((row) => row.id === selectedId.value) ?? null);

// ── Editor wiring ───────────────────────────────────────────────────────────
const editorOpen = ref(false);
const editTarget = ref<Supplier | null>(null);

function openAdd(): void {
  editTarget.value = null;
  editorOpen.value = true;
}

function openEdit(supplier: Supplier): void {
  editTarget.value = supplier;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
}

// ── Delete (two-step, blocked while invoices reference the supplier) ────────
const confirmingDeleteId = ref<string | null>(null);
const deleting = ref(false);

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

async function onConfirmRemove(supplier: Supplier): Promise<void> {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const result = await removeSupplier(supplier);
    if (!result.ok) {
      console.error('[suppliers] delete failed', { id: supplier.id, key: result.error });
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
  <section class="sv">
    <template v-if="!selected">
      <input
        v-model="query"
        type="search"
        class="sv__search"
        data-testid="supplier-search"
        :placeholder="t('suppliers.searchPlaceholder')"
      />

      <p v-if="filtered.length === 0" class="sv__empty" data-testid="suppliers-empty">
        {{ t('suppliers.empty') }}
      </p>

      <ul v-else class="sv__list" data-testid="suppliers-list">
        <li
          v-for="row in filtered"
          :key="row.id"
          class="sv__card"
          data-testid="supplier-row"
          @click="selectedId = row.id"
        >
          <div v-if="confirmingDeleteId === row.id" class="sv__confirm" @click.stop>
            <span class="sv__confirm-text" data-testid="supplier-delete-confirm">
              {{ t('suppliers.deleteConfirm') }}
            </span>
            <div class="sv__actions">
              <button
                type="button"
                class="sv__btn sv__btn--danger"
                data-testid="supplier-confirm-delete"
                :disabled="deleting"
                @click="onConfirmRemove(row)"
              >
                {{ t('common.confirm') }}
              </button>
              <button
                type="button"
                class="sv__btn"
                data-testid="supplier-cancel-delete"
                :disabled="deleting"
                @click="confirmingDeleteId = null"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>

          <template v-else>
            <div class="sv__main">
              <div class="sv__info" data-testid="supplier-info">
                <span class="sv__name" data-testid="supplier-name-cell">{{ row.name }}</span>
                <span
                  v-if="row.phone"
                  class="sv__phone"
                  dir="ltr"
                  data-testid="supplier-phone-cell"
                >
                  {{ row.phone }}
                </span>
              </div>
              <span
                class="sv__badge"
                :class="{ 'sv__badge--due': row.balanceUsdCents > 0 }"
                dir="ltr"
                data-testid="supplier-balance-badge"
              >
                {{ formatMoney(row.balanceUsdCents, 'USD') }}
              </span>
            </div>

            <div class="sv__actions" @click.stop>
              <button
                type="button"
                class="sv__btn"
                data-testid="supplier-edit"
                @click="openEdit(row)"
              >
                {{ t('common.edit') }}
              </button>
              <button
                type="button"
                class="sv__btn sv__btn--danger"
                data-testid="supplier-delete"
                @click="confirmingDeleteId = row.id"
              >
                {{ t('common.delete') }}
              </button>
            </div>
          </template>
        </li>
      </ul>

      <button
        type="button"
        class="sv__fab"
        data-testid="supplier-fab"
        :aria-label="t('suppliers.addSupplier')"
        :title="t('suppliers.addSupplier')"
        @click="openAdd()"
      >
        <span aria-hidden="true">＋</span>
      </button>
    </template>

    <SupplierDetail v-else :supplier="selected" @back="selectedId = null" />

    <SupplierEditor
      :open="editorOpen"
      :supplier="editTarget"
      @saved="closeEditor()"
      @close="closeEditor()"
    />
  </section>
</template>

<style scoped>
.sv {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sv__search {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

.sv__search:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.sv__empty {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.sv__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sv__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.sv__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.sv__info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-inline-size: 0;
}

.sv__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.sv__phone {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.sv__badge {
  flex-shrink: 0;
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.sv__badge--due {
  background: rgb(220 38 38 / 0.1);
  color: var(--color-danger);
}

.sv__confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.sv__confirm-text {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.sv__actions {
  display: flex;
  gap: var(--space-2);
}

.sv__btn {
  min-block-size: calc(var(--tap-target-min) - 8px);
  padding-inline: var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.sv__btn--danger {
  background: rgb(220 38 38 / 0.1);
  color: var(--color-danger);
}

.sv__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sv__fab {
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
</style>
