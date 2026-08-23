<script setup lang="ts">
/**
 * NumberInput — text input that emits integer cents (default) or a plain
 * number (`mode="plain"`), so monetary values never round-trip through
 * floats in app state (AGENTS.md money rules).
 */
import { computed, ref, watch } from 'vue';

import { fromCents, toCents } from '@/utils/money';

const props = defineProps<{
  label?: string;
  placeholder?: string;
  /** `amount` (default) emits integer cents; `plain` emits the raw number. */
  mode?: 'amount' | 'plain';
  disabled?: boolean;
  invalid?: boolean;
}>();

const model = defineModel<number | null>({ default: null });

const emit = defineEmits<{ valid: [value: boolean] }>();

const mode = computed(() => props.mode ?? 'amount');
const text = ref('');
const touched = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
/** Echo guard: ignore model changes we produced ourselves. */
let lastEmitted: number | null = model.value;

watch(
  model,
  (cents) => {
    if (cents === lastEmitted) return;
    if (document.activeElement === inputEl.value) return; // don't fight the typist
    text.value = cents === null ? '' : String(mode.value === 'amount' ? fromCents(cents) : cents);
    lastEmitted = cents;
  },
  { immediate: true },
);

function commit(value: number | null): void {
  lastEmitted = value;
  model.value = value;
}

const hasError = computed(() => touched.value && text.value.trim() !== '' && parse().ok === false);
const ariaInvalid = computed(() => props.invalid || hasError.value);

function parse(): { ok: true; value: number } | { ok: false } {
  const raw = text.value.trim();
  if (raw === '') return { ok: false };
  try {
    if (mode.value === 'amount') return { ok: true, value: toCents(raw) };
    const n = Number(raw);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function onInput(): void {
  touched.value = true;
  const parsed = parse();
  commit(parsed.ok ? parsed.value : null);
  emit('valid', parsed.ok || text.value.trim() === '');
}

function onBlur(): void {
  const parsed = parse();
  if (!parsed.ok) return; // keep the user's text visible for correction
  // normalize display ("12.5" → "12.50" for amount mode)
  text.value = mode.value === 'amount' ? String(fromCents(parsed.value)) : String(parsed.value);
}
</script>

<template>
  <label class="num-input">
    <span v-if="label" class="num-input__label">{{ label }}</span>
    <input
      ref="inputEl"
      v-model="text"
      type="text"
      inputmode="decimal"
      dir="ltr"
      class="num-input__field"
      :class="{ 'num-input__field--invalid': ariaInvalid }"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="ariaInvalid"
      @input="onInput"
      @blur="onBlur"
    />
  </label>
</template>

<style scoped>
.num-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.num-input__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.num-input__field {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-lg);
  text-align: start;
}

.num-input__field:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.num-input__field--invalid {
  border-color: var(--color-danger);
}
</style>
