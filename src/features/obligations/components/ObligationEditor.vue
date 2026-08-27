<script setup lang="ts">
/**
 * ObligationEditor — add/edit modal for recurring obligations (M6).
 *
 * Name is required; the monthly amount is captured through NumberInput so
 * it lands as integer USD cents (never a float), and the due day is a
 * 1–31 select. The save rides the standard offline-first pipeline through
 * `useObligations().saveObligation()` (optimistic IDB put → sync queue).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import NumberInput from '@/components/NumberInput.vue';
import { useObligations, type ObligationErrorKey } from '@/composables/useObligations';
import { useToast } from '@/composables/useToast';

import type { Obligation } from '@/types/domain';

const props = defineProps<{ open: boolean; obligation?: Obligation | null }>();

const emit = defineEmits<{ saved: []; close: [] }>();

const { t } = useI18n();
const toast = useToast();
const { saveObligation } = useObligations();

const dialogRef = ref<HTMLDivElement | null>(null);

const name = ref('');
const amountCents = ref<number | null>(null);
const dueDay = ref(1);
const active = ref(true);
const nameDirty = ref(false);
const amountDirty = ref(false);
const saving = ref(false);

const DUE_DAYS: readonly number[] = Array.from({ length: 31 }, (_unused, index) => index + 1);

function resetForm(): void {
  name.value = props.obligation?.name ?? '';
  amountCents.value = props.obligation?.amountUsdCents ?? null;
  dueDay.value = props.obligation?.dueDay ?? 1;
  active.value = props.obligation?.active ?? true;
  nameDirty.value = false;
  amountDirty.value = false;
}

const cleanName = computed(() => name.value.trim());
const amountOk = computed(
  () => amountCents.value !== null && Number.isInteger(amountCents.value) && amountCents.value > 0,
);

watch(amountCents, () => {
  amountDirty.value = true;
});

const nameError = computed(() =>
  nameDirty.value && cleanName.value === '' ? t('obligations.invalidName') : '',
);
const amountError = computed(() =>
  amountDirty.value && !amountOk.value ? t('obligations.invalidAmount') : '',
);

const canSave = computed(() => !saving.value && cleanName.value !== '' && amountOk.value);

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
  if (!canSave.value || amountCents.value === null) return;
  saving.value = true;
  try {
    const result = await saveObligation(
      {
        name: cleanName.value,
        amountUsdCents: amountCents.value,
        dueDay: dueDay.value,
        active: active.value,
      },
      props.obligation ?? undefined,
    );
    if (!result.ok) {
      console.error('[obligations] editor save failed', { key: result.error });
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
    <div v-if="open" class="oe__overlay" @click.self="close()">
      <div
        ref="dialogRef"
        class="oe__dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        data-testid="obligation-dialog"
        :aria-label="obligation ? t('obligations.editObligation') : t('obligations.addObligation')"
      >
        <header class="oe__header">
          <h2 class="oe__title">
            {{ obligation ? t('obligations.editObligation') : t('obligations.addObligation') }}
          </h2>
          <button
            type="button"
            class="oe__close"
            data-testid="obligation-dialog-close"
            :aria-label="t('common.close')"
            @click="close()"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <label class="oe__field">
          <span class="oe__label">{{ t('obligations.name') }}</span>
          <input
            v-model="name"
            type="text"
            class="oe__input"
            data-testid="obligation-name"
            :disabled="saving"
            @blur="nameDirty = true"
          />
        </label>
        <p v-if="nameError !== ''" class="oe__error" data-testid="obligation-name-error">
          {{ nameError }}
        </p>

        <div class="oe__field" data-testid="obligation-amount-wrap">
          <NumberInput
            v-model="amountCents"
            :label="t('obligations.amountUsd')"
            :disabled="saving"
          />
        </div>
        <p v-if="amountError !== ''" class="oe__error" data-testid="obligation-amount-error">
          {{ amountError }}
        </p>

        <label class="oe__field">
          <span class="oe__label">{{ t('obligations.dueDay') }}</span>
          <select
            v-model.number="dueDay"
            class="oe__input"
            data-testid="obligation-due-day"
            :disabled="saving"
          >
            <option v-for="day in DUE_DAYS" :key="day" :value="day">{{ day }}</option>
          </select>
        </label>

        <label class="oe__toggle">
          <input
            v-model="active"
            type="checkbox"
            data-testid="obligation-active"
            :disabled="saving"
          />
          <span>{{ t('obligations.active') }}</span>
        </label>

        <div class="oe__actions">
          <button
            type="button"
            class="oe__btn"
            data-testid="obligation-cancel"
            :disabled="saving"
            @click="close()"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="oe__btn oe__btn--primary"
            data-testid="obligation-save"
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
.oe__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(15 23 42 / 0.45);
}

.oe__dialog {
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

.oe__dialog:focus {
  outline: none;
}

.oe__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.oe__title {
  font-size: var(--font-size-lg);
}

.oe__close {
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

.oe__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.oe__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.oe__input {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
}

select.oe__input {
  appearance: none;
}

.oe__input:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.oe__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-base);
}

.oe__toggle input[type='checkbox'] {
  inline-size: 1.15rem;
  block-size: 1.15rem;
  accent-color: var(--color-brand-700);
}

.oe__error {
  margin-block-start: calc(-1 * var(--space-2));
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.oe__actions {
  display: flex;
  gap: var(--space-2);
  padding-block-start: var(--space-2);
}

.oe__btn {
  flex: 1;
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-base);
}

.oe__btn--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.oe__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
