<script setup lang="ts">
/**
 * SupplierEditor — add/edit modal for suppliers (PRD §6.3).
 *
 * Name is required; the optional phone validates against the PRD audience
 * (Lebanon + Syria) via `validateMerchantPhone` and shows an inline Arabic
 * error. The save rides the standard offline-first pipeline through
 * `useSuppliers().saveSupplier()` (optimistic IDB put → sync queue).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useToast } from '@/composables/useToast';
import { useSuppliers, type SupplierErrorKey } from '@/features/suppliers/useSuppliers';
import { validateMerchantPhone } from '@/utils/phone';

import type { Supplier } from '@/types/domain';

const props = defineProps<{ open: boolean; supplier?: Supplier | null }>();

const emit = defineEmits<{ saved: []; close: [] }>();

const { t } = useI18n();
const toast = useToast();
const { saveSupplier } = useSuppliers();

const dialogRef = ref<HTMLDivElement | null>(null);

const name = ref('');
const phone = ref('');
const nameDirty = ref(false);
const phoneDirty = ref(false);
const saving = ref(false);

function resetForm(): void {
  name.value = props.supplier?.name ?? '';
  phone.value = props.supplier?.phone ?? '';
  nameDirty.value = false;
  phoneDirty.value = false;
}

const cleanName = computed(() => name.value.trim());
const phoneOk = computed(() => {
  const raw = phone.value.trim();
  return raw === '' || validateMerchantPhone(raw).ok;
});

const nameError = computed(() =>
  nameDirty.value && cleanName.value === '' ? t('suppliers.invalidName') : '',
);
const phoneError = computed(() =>
  phoneDirty.value && !phoneOk.value ? t('suppliers.phoneInvalid') : '',
);

const canSave = computed(() => !saving.value && cleanName.value !== '' && phoneOk.value);

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
  if (!canSave.value) return;
  saving.value = true;
  try {
    const rawPhone = phone.value.trim();
    const result = await saveSupplier(
      rawPhone === '' ? { name: cleanName.value } : { name: cleanName.value, phone: rawPhone },
      props.supplier ?? undefined,
    );
    if (!result.ok) {
      console.error('[suppliers] editor save failed', { key: result.error });
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
    <div v-if="open" class="se__overlay" @click.self="close()">
      <div
        ref="dialogRef"
        class="se__dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        data-testid="supplier-dialog"
        :aria-label="supplier ? t('suppliers.editSupplier') : t('suppliers.addSupplier')"
      >
        <header class="se__header">
          <h2 class="se__title">
            {{ supplier ? t('suppliers.editSupplier') : t('suppliers.addSupplier') }}
          </h2>
          <button
            type="button"
            class="se__close"
            data-testid="supplier-dialog-close"
            :aria-label="t('common.close')"
            @click="close()"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <label class="se__field">
          <span class="se__label">{{ t('suppliers.name') }}</span>
          <input
            v-model="name"
            type="text"
            class="se__input"
            data-testid="supplier-name"
            :disabled="saving"
            @blur="nameDirty = true"
          />
        </label>
        <p v-if="nameError !== ''" class="se__error" data-testid="supplier-name-error">
          {{ nameError }}
        </p>

        <label class="se__field">
          <span class="se__label">{{ t('suppliers.phone') }}</span>
          <input
            v-model="phone"
            type="tel"
            dir="ltr"
            class="se__input"
            data-testid="supplier-phone"
            :placeholder="'+961…'"
            :disabled="saving"
            @blur="phoneDirty = true"
          />
        </label>
        <p v-if="phoneError !== ''" class="se__error" data-testid="supplier-phone-error">
          {{ phoneError }}
        </p>

        <div class="se__actions">
          <button
            type="button"
            class="se__btn"
            data-testid="supplier-cancel"
            :disabled="saving"
            @click="close()"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="se__btn se__btn--primary"
            data-testid="supplier-save"
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
.se__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
}

.se__dialog {
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

.se__dialog:focus {
  outline: none;
}

.se__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.se__title {
  font-size: var(--font-size-lg);
}

.se__close {
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

.se__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.se__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.se__input {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

.se__input:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.se__error {
  margin-block-start: calc(-1 * var(--space-2));
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.se__actions {
  display: flex;
  gap: var(--space-2);
  padding-block-start: var(--space-2);
}

.se__btn {
  flex: 1;
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-base);
}

.se__btn--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.se__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
