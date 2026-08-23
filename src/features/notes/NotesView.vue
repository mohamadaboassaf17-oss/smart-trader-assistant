<script setup lang="ts">
/**
 * Daily notes screen (PRD §6.7) — M4.
 *
 * A fast, date-linked notepad: multiple notes per day are allowed, with
 * inline edit and a lightweight two-step delete. Reads are IndexedDB-first;
 * every mutation rides the standard optimistic sync-queue path (same
 * pipeline as the sales screen) and refreshes this list.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useToast } from '@/composables/useToast';
import { db } from '@/services/idb/db';
import { tryAsync } from '@/types/result';

import NoteComposer from './components/NoteComposer.vue';
import NoteItem from './components/NoteItem.vue';

import type { DailyNote } from '@/types/domain';

const { t } = useI18n();
const toast = useToast();

const notes = ref<DailyNote[]>([]);

/** Newest business day first; within one day, newest entry first. */
async function refresh(): Promise<void> {
  const result = await tryAsync(() => db.dailyNote.toArray());
  if (!result.ok) {
    console.error('[notes] list query failed', { message: result.error.message });
    toast.error(t('common.error'));
    return;
  }
  notes.value = [...result.value].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <section class="notes">
    <NoteComposer @added="refresh()" />

    <p v-if="notes.length === 0" class="notes__empty" data-testid="notes-empty">
      {{ t('notes.empty') }}
    </p>

    <ul v-else class="notes__list" data-testid="notes-list">
      <NoteItem
        v-for="note in notes"
        :key="note.id"
        :note="note"
        @changed="refresh()"
        @removed="refresh()"
      />
    </ul>
  </section>
</template>

<style scoped>
.notes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block-end: var(--space-16);
}

.notes__empty {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.notes__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
