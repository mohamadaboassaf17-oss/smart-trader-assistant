<script setup lang="ts">
/**
 * MoveDialog — manual shelf↔warehouse quantity move (PRD §6.4).
 *
 * Shows the product's current counts, a segmented direction toggle, and an
 * integer quantity input with live client-side validation (integer ≥ 1 and
 * ≤ the source-side stock). The save rides `useInventory().moveStock()`,
 * which persists the corrected product row plus an inventoryMove audit row.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useToast } from '@/composables/useToast';
import { useInventory, type InventoryErrorKey } from '@/features/inventory/useInventory';

import type { InventoryMoveDirection, Product } from '@/types/domain';

const props = defineProps<{ open: boolean; product?: Product | null }>();

const emit = defineEmits<{ moved: []; close: [] }>();

const { t } = useI18n();
const toast = useToast();
const { moveStock } = useInventory();

const dialogRef = ref<HTMLDivElement | null>(null);

const direction = ref<InventoryMoveDirection>('shelfToWarehouse');
const quantityRaw = ref('');
const saving = ref(false);

function resetForm(): void {
  direction.value = 'shelfToWarehouse';
  quantityRaw.value = '';
}

/** Strict integer parse — rejects fractions, blanks and non-numeric text. */
function parseIntStrict(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isInteger(value) ? value : null;
}

const parsedQuantity = computed(() => parseIntStrict(quantityRaw.value));

const sourceAvailable = computed(() => {
  if (!props.product) return 0;
  return direction.value === 'shelfToWarehouse'
    ? props.product.shelfQty
    : props.product.warehouseQty;
});

const invalidReason = computed<'none' | 'invalidQty' | 'insufficient'>(() => {
  const quantity = parsedQuantity.value;
  if (quantity === null || quantity < 1) return 'invalidQty';
  if (quantity > sourceAvailable.value) return 'insufficient';
  return 'none';
});

/** Live validation — surfaces as soon as the user starts typing. */
const qtyError = computed(() => {
  if (quantityRaw.value.trim() === '') return '';
  if (invalidReason.value === 'invalidQty') return t('inventory.invalidQty');
  if (invalidReason.value === 'insufficient') return t('inventory.insufficient');
  return '';
});

const canSave = computed(
  () => !saving.value && props.product !== null && invalidReason.value === 'none',
);

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
  if (!canSave.value || !props.product) return;
  const quantity = parsedQuantity.value;
  if (quantity === null) return;
  saving.value = true;
  try {
    const result = await moveStock({
      productId: props.product.id,
      direction: direction.value,
      quantity,
    });
    if (!result.ok) {
      console.error('[inventory] move failed', { key: result.error });
      toast.error(errorText(result.error));
      return;
    }
    toast.success(t('toasts.savedLocally'));
    emit('moved');
    emit('close');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="md__overlay" @click.self="close()">
      <div
        ref="dialogRef"
        class="md__dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        data-testid="move-dialog"
        :aria-label="t('inventory.move')"
      >
        <header class="md__header">
          <h2 class="md__title" data-testid="move-product-name">
            {{ product?.name }}
          </h2>
          <button
            type="button"
            class="md__close"
            data-testid="move-dialog-close"
            :aria-label="t('common.close')"
            @click="close()"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <dl class="md__counts" data-testid="move-counts">
          <div class="md__count">
            <dt class="md__count-label">{{ t('inventory.shelf') }}</dt>
            <dd class="md__count-value" dir="ltr">{{ product?.shelfQty ?? 0 }}</dd>
          </div>
          <div class="md__count">
            <dt class="md__count-label">{{ t('inventory.warehouse') }}</dt>
            <dd class="md__count-value" dir="ltr">{{ product?.warehouseQty ?? 0 }}</dd>
          </div>
        </dl>

        <div class="md__segmented" role="group" :aria-label="t('inventory.move')">
          <button
            type="button"
            class="md__segment"
            data-testid="move-to-warehouse"
            :aria-pressed="direction === 'shelfToWarehouse'"
            :class="{ 'md__segment--active': direction === 'shelfToWarehouse' }"
            @click="direction = 'shelfToWarehouse'"
          >
            {{ t('inventory.moveToWarehouse') }}
          </button>
          <button
            type="button"
            class="md__segment"
            data-testid="move-to-shelf"
            :aria-pressed="direction === 'warehouseToShelf'"
            :class="{ 'md__segment--active': direction === 'warehouseToShelf' }"
            @click="direction = 'warehouseToShelf'"
          >
            {{ t('inventory.moveToShelf') }}
          </button>
        </div>

        <label class="md__field">
          <span class="md__label">{{ t('inventory.quantity') }}</span>
          <input
            v-model="quantityRaw"
            type="text"
            inputmode="numeric"
            dir="ltr"
            class="md__input"
            data-testid="move-quantity"
            :disabled="saving"
          />
        </label>
        <p v-if="qtyError !== ''" class="md__error" data-testid="move-qty-error">
          {{ qtyError }}
        </p>

        <div class="md__actions">
          <button
            type="button"
            class="md__btn"
            data-testid="move-cancel"
            :disabled="saving"
            @click="close()"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="md__btn md__btn--primary"
            data-testid="move-save"
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
.md__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
}

.md__dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  inline-size: 100%;
  max-inline-size: var(--max-width);
  padding: var(--space-5) var(--space-4);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.md__dialog:focus {
  outline: none;
}

.md__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.md__title {
  font-size: var(--font-size-lg);
}

.md__close {
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

.md__counts {
  display: flex;
  gap: var(--space-2);
  margin: 0;
}

.md__count {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

.md__count-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.md__count-value {
  margin: 0;
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.md__segmented {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

.md__segment {
  flex: 1;
  min-block-size: calc(var(--tap-target-min) - 8px);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.md__segment--active {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
}

.md__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.md__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.md__input {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

.md__input:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.md__error {
  margin-block-start: calc(-1 * var(--space-2));
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.md__actions {
  display: flex;
  gap: var(--space-2);
  padding-block-start: var(--space-2);
}

.md__btn {
  flex: 1;
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-base);
}

.md__btn--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.md__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
