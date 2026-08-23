import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import { addDaysIso } from '@/composables/useDayFormat';
import NotesView from '@/features/notes/NotesView.vue';
import { db } from '@/services/idb/db';
import { todayIso } from '@/services/idb/exchangeRates';
import { enqueueUpsert } from '@/services/sync/queue';

import type { DailyNote } from '@/types/domain';

/**
 * IndexedDB callbacks fire on macrotasks, so plain flushPromises is not
 * enough to settle the load/save pipeline under fake-indexeddb.
 */
async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let seq = 0;

function seedNote(overrides: Partial<DailyNote> = {}): DailyNote {
  seq += 1;
  const nowIso = new Date().toISOString();
  return {
    id: overrides.id ?? `${String(seq).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
    createdAt: overrides.createdAt ?? nowIso,
    updatedAt: overrides.updatedAt ?? nowIso,
    date: overrides.date ?? todayIso(),
    body: overrides.body ?? 'ملاحظة',
  };
}

async function mountNotes() {
  const wrapper = mount(NotesView, { global: { plugins: [i18n] } });
  await settle();
  return wrapper;
}

function items(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-testid="note-item"]');
}

beforeEach(async () => {
  seq = 0;
  await db.dailyNote.clear();
  await db.syncQueue.clear();
});

describe('<NotesView>', () => {
  it('adds a note linked to today through the optimistic queue path', async () => {
    const wrapper = await mountNotes();
    expect(wrapper.find('[data-testid="notes-empty"]').exists()).toBe(true);

    await wrapper.find('[data-testid="note-add-input"]').setValue('مر مندوب شركة العصير');
    await wrapper.find('[data-testid="note-add-submit"]').trigger('click');
    await settle();

    const all = await db.dailyNote.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.date).toBe(todayIso());
    expect(all[0]!.body).toBe('مر مندوب شركة العصير');

    // The composer clears and the list shows the new note.
    expect(
      (wrapper.find('[data-testid="note-add-input"]').element as HTMLTextAreaElement).value,
    ).toBe('');
    expect(items(wrapper)).toHaveLength(1);
    expect(wrapper.find('[data-testid="note-body"]').text()).toContain('مر مندوب شركة العصير');

    const queueItems = (await db.syncQueue.toArray()).filter((item) => item.entity === 'dailyNote');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
    expect(queueItems[0]!.entityId).toBe(all[0]!.id);
  });

  it('edits a note inline in place', async () => {
    const seed = seedNote({ body: 'نسخة قديمة' });
    await db.dailyNote.put(seed);

    const wrapper = await mountNotes();
    await wrapper.find('[data-testid="note-edit"]').trigger('click');

    const editor = wrapper.find('[data-testid="note-editor"]');
    expect(editor.exists()).toBe(true);
    await editor.setValue('نسخة محدثة');
    await wrapper.find('[data-testid="note-save-edit"]').trigger('click');
    await settle();

    const all = await db.dailyNote.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(seed.id);
    expect(all[0]!.body).toBe('نسخة محدثة');
    expect(all[0]!.updatedAt >= seed.updatedAt).toBe(true);

    const queueItems = (await db.syncQueue.toArray()).filter((item) => item.entity === 'dailyNote');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');
    expect(queueItems[0]!.entityId).toBe(seed.id);
  });

  it('requires confirmation before deleting, then removes and enqueues the remove', async () => {
    const seed = seedNote({ body: 'ستُحذف' });
    await db.dailyNote.put(seed);

    const wrapper = await mountNotes();
    await wrapper.find('[data-testid="note-delete"]').trigger('click');

    // Confirmation is inline; nothing was deleted yet.
    expect(wrapper.find('[data-testid="note-delete-confirm"]').exists()).toBe(true);
    expect(await db.dailyNote.count()).toBe(1);

    await wrapper.find('[data-testid="note-confirm-delete"]').trigger('click');
    await settle();

    expect(await db.dailyNote.count()).toBe(0);

    const queueItems = (await db.syncQueue.toArray()).filter((item) => item.entity === 'dailyNote');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('remove');
    expect(queueItems[0]!.entityId).toBe(seed.id);
  });

  it('replaces a pending unsynced upsert with a remove via queue dedupe', async () => {
    const seed = seedNote({ body: 'لم تُزامن بعد' });
    await db.dailyNote.put(seed);
    await enqueueUpsert(seed, 'dailyNote'); // queued-but-unsynced create

    let queueItems = (await db.syncQueue.toArray()).filter(
      (item) => item.entity === 'dailyNote' && item.entityId === seed.id,
    );
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('upsert');

    const wrapper = await mountNotes();
    await wrapper.find('[data-testid="note-delete"]').trigger('click');
    await wrapper.find('[data-testid="note-confirm-delete"]').trigger('click');
    await settle();

    expect(await db.dailyNote.count()).toBe(0);
    queueItems = (await db.syncQueue.toArray()).filter(
      (item) => item.entity === 'dailyNote' && item.entityId === seed.id,
    );
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.op).toBe('remove');
  });

  it('lists newest days first', async () => {
    await db.dailyNote.bulkPut([
      seedNote({ date: todayIso(), body: 'ملاحظة اليوم' }),
      seedNote({ date: addDaysIso(todayIso(), -1), body: 'ملاحظة الأمس' }),
    ]);

    const wrapper = await mountNotes();
    const rows = items(wrapper);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('ملاحظة اليوم');
    expect(rows[1]!.text()).toContain('ملاحظة الأمس');
  });
});
