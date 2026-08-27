<script setup lang="ts">
/**
 * Inventory screen (PRD §6.4) — M5.
 *
 * Local-first product list (name | shelf | warehouse) with per-row
 * edit/move/delete, an add-FAB opening the ProductEditor, and a MoveDialog
 * for manual shelf↔warehouse transfers. Everything rides the standard
 * optimistic sync-queue path; failures surface as Arabic toasts.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useToast } from '@/composables/useToast';
import { useInventory, type InventoryErrorKey } from '@/features/inventory/useInventory';

import MoveDialog from './components/MoveDialog.vue';
import ProductEditor from './components/ProductEditor.vue';

import type { Product } from '@/types/domain';

const { t } = useI18n();
const toast = useToast();
const { products, refresh, removeProduct } = useInventory();

onMounted(() => {
  void refresh();
});

// ── Editor wiring ───────────────────────────────────────────────────────────
const editorOpen = ref(false);
const editTarget = ref<Product | null>(null);

function openAdd(): void {
  editTarget.value = null;
  editorOpen.value = true;
}

function openEdit(product: Product): void {
  editTarget.value = product;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
}

// ── Move dialog wiring ──────────────────────────────────────────────────────
const moveOpen = ref(false);
const moveTarget = ref<Product | null>(null);

function openMove(product: Product): void {
  moveTarget.value = product;
  moveOpen.value = true;
}

function closeMove(): void {
  moveOpen.value = false;
}

// ── Delete (two-step confirm, like suppliers) ───────────────────────────────
const confirmingDeleteId = ref<string | null>(null);
const deleting = ref(false);

/** AuthView-style explicit map — no dynamic i18n keys in templates. */
function errorText(key: InventoryErrorKey): string {
  const map: Record<InventoryErrorKey, string> = {
    'inventory.invalidName': t('inventory.invalidName'),
    'inventory.invalidQty': t('inventory.invalidQty'),
    'inventory.insufficient': t('inventory.insufficient'),
    unknown: t('common.error'),
  };
  return map[key];
}

async function onConfirmRemove(product: Product): Promise<void> {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const result = await removeProduct(product);
    if (!result.ok) {
      console.error('[inventory] delete failed', { id: product.id, key: result.error });
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
  <section class="iv">
    <p v-if="products.length === 0" class="iv__empty" data-testid="inventory-empty">
      {{ t('inventory.empty') }}
    </p>

    <ul v-else class="iv__list" data-testid="inventory-list">
      <li v-for="row in products" :key="row.id" class="iv__card" data-testid="product-row">
        <div v-if="confirmingDeleteId === row.id" class="iv__confirm" @click.stop>
          <span class="iv__confirm-text" data-testid="product-delete-confirm">
            {{ t('inventory.deleteConfirm') }}
          </span>
          <div class="iv__actions">
            <button
              type="button"
              class="iv__btn iv__btn--danger"
              data-testid="product-confirm-delete"
              :disabled="deleting"
              @click="onConfirmRemove(row)"
            >
              {{ t('common.confirm') }}
            </button>
            <button
              type="button"
              class="iv__btn"
              data-testid="product-cancel-delete"
              :disabled="deleting"
              @click="confirmingDeleteId = null"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>

        <template v-else>
          <div class="iv__main" @click="openMove(row)">
            <span class="iv__name" data-testid="product-name-cell">{{ row.name }}</span>
            <div class="iv__counts">
              <span class="iv__count" data-testid="product-shelf-cell">
                <span class="iv__count-label">{{ t('inventory.shelf') }}</span>
                <span class="iv__count-value" dir="ltr">{{ row.shelfQty }}</span>
              </span>
              <span class="iv__count" data-testid="product-warehouse-cell">
                <span class="iv__count-label">{{ t('inventory.warehouse') }}</span>
                <span class="iv__count-value" dir="ltr">{{ row.warehouseQty }}</span>
              </span>
            </div>
          </div>

          <div class="iv__actions" @click.stop>
            <button type="button" class="iv__btn" data-testid="product-edit" @click="openEdit(row)">
              {{ t('common.edit') }}
            </button>
            <button type="button" class="iv__btn" data-testid="product-move" @click="openMove(row)">
              {{ t('inventory.move') }}
            </button>
            <button
              type="button"
              class="iv__btn iv__btn--danger"
              data-testid="product-delete"
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
      class="iv__fab"
      data-testid="product-fab"
      :aria-label="t('inventory.addProduct')"
      :title="t('inventory.addProduct')"
      @click="openAdd()"
    >
      <span aria-hidden="true">＋</span>
    </button>

    <ProductEditor
      :open="editorOpen"
      :product="editTarget"
      @saved="closeEditor()"
      @close="closeEditor()"
    />

    <MoveDialog :open="moveOpen" :product="moveTarget" @moved="closeMove()" @close="closeMove()" />
  </section>
</template>

<style scoped>
.iv {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.iv__empty {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.iv__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.iv__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.iv__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  cursor: pointer;
}

.iv__name {
  min-inline-size: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.iv__counts {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-1);
}

.iv__count {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.iv__count-value {
  font-weight: 700;
  color: var(--color-text);
}

.iv__confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.iv__confirm-text {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.iv__actions {
  display: flex;
  gap: var(--space-2);
}

.iv__btn {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.iv__btn--danger {
  background: rgb(220 38 38 / 0.1);
  color: var(--color-danger);
}

.iv__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.iv__fab {
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
