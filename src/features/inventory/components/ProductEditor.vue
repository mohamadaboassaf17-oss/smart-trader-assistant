<script setup lang="ts">
/**
 * ProductEditor — add/edit modal for products (PRD §6.4).
 *
 * Name is required; shelf and warehouse quantities are integers ≥ 0
 * (default 0). Inline Arabic errors come from the composable's typed keys.
 * The save rides the standard offline-first pipeline through
 * `useInventory().saveProduct()` (optimistic IDB put → sync queue).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useToast } from '@/composables/useToast';
import { useInventory, type InventoryErrorKey } from '@/features/inventory/useInventory';

import type { Product } from '@/types/domain';

const props = defineProps<{ open: boolean; product?: Product | null }>();

const emit = defineEmits<{ saved: []; close: [] }>();

const { t } = useI18n();
const toast = useToast();
const { saveProduct } = useInventory();

const dialogRef = ref<HTMLDivElement | null>(null);

const name = ref('');
const shelfQtyRaw = ref('0');
const warehouseQtyRaw = ref('0');
const nameDirty = ref(false);
const saving = ref(false);

function resetForm(): void {
  name.value = props.product?.name ?? '';
  shelfQtyRaw.value = String(props.product?.shelfQty ?? 0);
  warehouseQtyRaw.value = String(props.product?.warehouseQty ?? 0);
  nameDirty.value = false;
}

const cleanName = computed(() => name.value.trim());

/** Strict integer parse — rejects fractions, blanks and non-numeric text. */
function parseIntStrict(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isInteger(value) ? value : null;
}

function parsedQty(raw: string): number | null {
  const value = parseIntStrict(raw);
  return value !== null && value >= 0 ? value : null;
}

const nameError = computed(() =>
  nameDirty.value && cleanName.value === '' ? t('inventory.invalidName') : '',
);
/** Live validation — quantities default to valid 0, so no error flashes on open. */
const qtyError = computed(() =>
  parsedQty(shelfQtyRaw.value) === null || parsedQty(warehouseQtyRaw.value) === null
    ? t('inventory.invalidQty')
    : '',
);

const canSave = computed(
  () =>
    !saving.value &&
    cleanName.value !== '' &&
    parsedQty(shelfQtyRaw.value) !== null &&
    parsedQty(warehouseQtyRaw.value) !== null,
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
  if (!canSave.value) return;
  saving.value = true;
  try {
    const shelfQty = parsedQty(shelfQtyRaw.value);
    const warehouseQty = parsedQty(warehouseQtyRaw.value);
    if (shelfQty === null || warehouseQty === null) {
      toast.error(t('inventory.invalidQty'));
      return;
    }
    const result = await saveProduct(
      { name: cleanName.value, shelfQty, warehouseQty },
      props.product ?? undefined,
    );
    if (!result.ok) {
      console.error('[inventory] editor save failed', { key: result.error });
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
    <div v-if="open" class="pe__overlay" @click.self="close()">
      <div
        ref="dialogRef"
        class="pe__dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        data-testid="product-dialog"
        :aria-label="product ? t('inventory.editProduct') : t('inventory.addProduct')"
      >
        <header class="pe__header">
          <h2 class="pe__title">
            {{ product ? t('inventory.editProduct') : t('inventory.addProduct') }}
          </h2>
          <button
            type="button"
            class="pe__close"
            data-testid="product-dialog-close"
            :aria-label="t('common.close')"
            @click="close()"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <label class="pe__field">
          <span class="pe__label">{{ t('inventory.name') }}</span>
          <input
            v-model="name"
            type="text"
            class="pe__input"
            data-testid="product-name"
            :disabled="saving"
            @blur="nameDirty = true"
          />
        </label>
        <p v-if="nameError !== ''" class="pe__error" data-testid="product-name-error">
          {{ nameError }}
        </p>

        <div class="pe__qty-row">
          <label class="pe__field">
            <span class="pe__label">{{ t('inventory.shelf') }}</span>
            <input
              v-model="shelfQtyRaw"
              type="text"
              inputmode="numeric"
              dir="ltr"
              class="pe__input"
              data-testid="product-shelf"
              :disabled="saving"
            />
          </label>
          <label class="pe__field">
            <span class="pe__label">{{ t('inventory.warehouse') }}</span>
            <input
              v-model="warehouseQtyRaw"
              type="text"
              inputmode="numeric"
              dir="ltr"
              class="pe__input"
              data-testid="product-warehouse"
              :disabled="saving"
            />
          </label>
        </div>
        <p v-if="qtyError !== ''" class="pe__error" data-testid="product-qty-error">
          {{ qtyError }}
        </p>

        <div class="pe__actions">
          <button
            type="button"
            class="pe__btn"
            data-testid="product-cancel"
            :disabled="saving"
            @click="close()"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="pe__btn pe__btn--primary"
            data-testid="product-save"
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
.pe__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
}

.pe__dialog {
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

.pe__dialog:focus {
  outline: none;
}

.pe__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pe__title {
  font-size: var(--font-size-lg);
}

.pe__close {
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

.pe__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.pe__qty-row {
  display: flex;
  gap: var(--space-2);
}

.pe__qty-row > .pe__field {
  flex: 1;
}

.pe__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.pe__input {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

.pe__input:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.pe__error {
  margin-block-start: calc(-1 * var(--space-2));
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.pe__actions {
  display: flex;
  gap: var(--space-2);
  padding-block-start: var(--space-2);
}

.pe__btn {
  flex: 1;
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-base);
}

.pe__btn--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.pe__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
