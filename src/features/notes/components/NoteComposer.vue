<script setup lang="ts">
/**
 * NoteComposer — fast add for the daily notepad (PRD §6.7).
 *
 * One textarea plus a business-day picker that defaults to today; multiple
 * notes per day are allowed (`daily_note`, PRD §6.7). The save rides the
 * standard offline-first pipeline: optimistic IDB put → sync queue.
 */
import { v4 as uuidv4 } from 'uuid';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useOfflineSync } from '@/composables/useOfflineSync';
import { useToast } from '@/composables/useToast';
import { todayIso } from '@/services/idb/exchangeRates';

import type { DailyNote } from '@/types/domain';

const emit = defineEmits<{ added: [] }>();

const { t } = useI18n();
const { save } = useOfflineSync();
const toast = useToast();

const date = ref(todayIso());
const body = ref('');
const saving = ref(false);

const trimmedBody = computed(() => body.value.trim());
const canSave = computed(() => !saving.value && trimmedBody.value !== '');

async function onAdd(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const nowIso = new Date().toISOString();
    const row: DailyNote = {
      id: uuidv4(),
      createdAt: nowIso,
      updatedAt: nowIso,
      date: date.value,
      body: trimmedBody.value,
    };

    const result = await save('dailyNote', row);
    if (!result.ok) {
      console.error('[notes] composer save failed', {
        date: row.date,
        message: result.error.message,
      });
      toast.error(t('common.error'));
      return;
    }
    body.value = '';
    toast.success(t('toasts.savedLocally'));
    emit('added');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="composer">
    <label class="composer__field">
      <span class="composer__label">{{ t('notes.noteDate') }}</span>
      <input
        v-model="date"
        type="date"
        class="composer__date"
        data-testid="note-add-date"
        :disabled="saving"
      />
    </label>

    <textarea
      v-model="body"
      rows="2"
      class="composer__input"
      data-testid="note-add-input"
      :placeholder="t('notes.addPlaceholder')"
      :disabled="saving"
    ></textarea>

    <button
      type="button"
      class="composer__add"
      data-testid="note-add-submit"
      :disabled="!canSave"
      @click="onAdd"
    >
      {{ t('common.add') }}
    </button>
  </div>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.composer__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.composer__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}

.composer__date {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.composer__input {
  padding-inline: var(--space-3);
  padding-block: var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
  resize: vertical;
}

.composer__input:focus,
.composer__date:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.composer__add {
  min-block-size: calc(var(--tap-target-min));
  align-self: stretch;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-lg);
}

.composer__add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
