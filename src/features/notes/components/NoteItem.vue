<script setup lang="ts">
/**
 * NoteItem — one dated note row (PRD §6.7).
 *
 * Inline edit and a two-step delete confirmation, both riding the standard
 * optimistic path. Removing a note that is still queued-but-unsynced works
 * through the queue's `[entity+entityId]` dedupe: the pending upsert is
 * replaced by a single `remove` op.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { formatDayLabel } from '@/composables/useDayFormat';
import { useOfflineSync } from '@/composables/useOfflineSync';
import { useToast } from '@/composables/useToast';
import { todayIso } from '@/services/idb/exchangeRates';

import type { DailyNote } from '@/types/domain';

const props = defineProps<{ note: DailyNote }>();

const emit = defineEmits<{ changed: []; removed: [] }>();

const { t } = useI18n();
const { save, remove } = useOfflineSync();
const toast = useToast();

const editing = ref(false);
const draftBody = ref(props.note.body);
const saving = ref(false);
const confirmingDelete = ref(false);

const isToday = computed(() => props.note.date === todayIso());
/** Date label via the shared day formatter; "اليوم" wins for today. */
const dayLabel = computed(() =>
  isToday.value ? t('common.today') : formatDayLabel(props.note.date),
);

const trimmedDraft = computed(() => draftBody.value.trim());
const canSaveEdit = computed(
  () => !saving.value && trimmedDraft.value !== '' && trimmedDraft.value !== props.note.body,
);

function startEdit(): void {
  draftBody.value = props.note.body;
  confirmingDelete.value = false;
  editing.value = true;
}

function cancelEdit(): void {
  editing.value = false;
}

async function onSaveEdit(): Promise<void> {
  if (!canSaveEdit.value) return;
  saving.value = true;
  try {
    const row: DailyNote = {
      ...props.note,
      body: trimmedDraft.value,
      updatedAt: new Date().toISOString(),
    };
    // Same id → optimistic put + queue dedupe replaces any pending op.
    const result = await save('dailyNote', row);
    if (!result.ok) {
      console.error('[notes] edit save failed', { id: row.id, message: result.error.message });
      toast.error(t('common.error'));
      return;
    }
    editing.value = false;
    toast.success(t('toasts.savedLocally'));
    emit('changed');
  } finally {
    saving.value = false;
  }
}

async function onConfirmRemove(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    const result = await remove('dailyNote', props.note);
    if (!result.ok) {
      console.error('[notes] remove failed', {
        id: props.note.id,
        message: result.error.message,
      });
      toast.error(t('common.error'));
      return;
    }
    confirmingDelete.value = false;
    toast.success(t('notes.deleted'));
    emit('removed');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <li class="item" data-testid="note-item">
    <span class="item__day" :class="{ 'item__day--today': isToday }" data-testid="note-date">
      {{ dayLabel }}
    </span>

    <p v-if="!editing" class="item__body" data-testid="note-body">{{ props.note.body }}</p>
    <textarea
      v-else
      v-model="draftBody"
      rows="3"
      class="item__editor"
      data-testid="note-editor"
      :disabled="saving"
    ></textarea>

    <div v-if="confirmingDelete" class="item__row" data-testid="note-delete-confirm">
      <span class="item__confirm-text">{{ t('notes.confirmDelete') }}</span>
      <div class="item__actions">
        <button
          type="button"
          class="item__action item__action--danger"
          data-testid="note-confirm-delete"
          :disabled="saving"
          @click="onConfirmRemove"
        >
          {{ t('common.confirm') }}
        </button>
        <button
          type="button"
          class="item__action"
          data-testid="note-cancel-delete"
          :disabled="saving"
          @click="confirmingDelete = false"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>

    <div v-else-if="editing" class="item__actions">
      <button
        type="button"
        class="item__action item__action--primary"
        data-testid="note-save-edit"
        :disabled="!canSaveEdit"
        @click="onSaveEdit"
      >
        {{ t('common.save') }}
      </button>
      <button
        type="button"
        class="item__action"
        data-testid="note-cancel-edit"
        :disabled="saving"
        @click="cancelEdit"
      >
        {{ t('common.cancel') }}
      </button>
    </div>

    <div v-else class="item__actions">
      <button type="button" class="item__action" data-testid="note-edit" @click="startEdit">
        {{ t('common.edit') }}
      </button>
      <button
        type="button"
        class="item__action item__action--danger"
        data-testid="note-delete"
        @click="confirmingDelete = true"
      >
        {{ t('common.delete') }}
      </button>
    </div>
  </li>
</template>

<style scoped>
.item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.item__day {
  align-self: start;
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.item__day--today {
  background: var(--color-brand-50);
  color: var(--color-brand-700);
  font-weight: 600;
}

.item__body {
  font-size: var(--font-size-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.item__editor {
  padding-inline: var(--space-3);
  padding-block: var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-base);
  resize: vertical;
}

.item__editor:focus {
  outline: 2px solid var(--color-brand-600);
  outline-offset: -1px;
}

.item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.item__confirm-text {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.item__actions {
  display: flex;
  gap: var(--space-2);
}

.item__action {
  min-block-size: calc(var(--tap-target-min) - 8px);
  padding-inline: var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.item__action--danger {
  background: rgb(220 38 38 / 0.1);
  color: var(--color-danger);
}

.item__action--primary {
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
}

.item__action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
