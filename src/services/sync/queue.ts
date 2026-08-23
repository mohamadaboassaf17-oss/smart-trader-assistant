/**
 * Sync queue (PRD §7.1 — طابور المزامنة).
 *
 * Every local mutation that must reach Supabase is enqueued here. Items are
 * flushed oldest-first; a failed attempt schedules the next attempt with
 * exponential backoff (`nextAttemptAt`) and records `lastError`.
 *
 * Dedupe: re-enqueueing the same (entity, entityId) replaces the pending
 * item — the newest payload wins, so rapid edits don't pile up.
 *
 * Ownership: `userId` is stamped into outgoing payloads AT ENQUEUE TIME
 * from the live auth session (migrations 0002–0005 declare `user_id not null`
 * and RLS checks `auth.uid() = user_id`). Stamping here keeps the payload
 * complete + immutable across flush restarts; a protected entity enqueued
 * while a configured remote exists but no session does is rejected instead
 * of becoming a dead-lettered orphan row.
 */

import { v4 as uuidv4 } from 'uuid';

import { db } from '@/services/idb/db';
import { getSupabase } from '@/services/supabase/client';

import { computeBackoffMs, type BackoffOptions } from './backoff';

import type { EntityName, SyncQueueItem, TBaseRow } from '@/types/domain';

export const MAX_RETRIES = 8;

export type SyncOp = SyncQueueItem['op'];

/**
 * Entities whose tables declare `user_id uuid not null` (migrations 0002–
 * 0005). Future tables join this set when their migrations land; `profile`
 * stays out because its PK already is the user id and it has no user_id
 * column.
 */
const ENTITIES_REQUIRING_USER_ID: ReadonlySet<EntityName> = new Set<EntityName>([
  'sale',
  'sidePurchase',
  'dailyNote',
  'goal',
]);

function nowIso(): string {
  return new Date().toISOString();
}

/** Replace any pending item for (entity, entityId) with this new one. */
/** Optional overrides (mainly for deterministic tests). */
export interface EnqueueOptions {
  /** Force a specific createdAt ISO string. */
  createdAt?: string;
}

async function replacePending(item: SyncQueueItem): Promise<void> {
  await db.transaction('rw', db.syncQueue, async () => {
    const existing = await db.syncQueue
      .where('[entity+entityId]')
      .equals([item.entity, item.entityId])
      .first();
    if (existing) await db.syncQueue.delete(existing.id);
    await db.syncQueue.put(item);
  });
}

export async function enqueueUpsert(
  row: TBaseRow,
  entity: EntityName,
  options: EnqueueOptions = {},
): Promise<SyncQueueItem> {
  // Stamp the owner from the live session; without a configured Supabase
  // project (offline-only build) there is no remote to push to, so rows stay
  // device-local and stamping is a no-op.
  const client = getSupabase();
  const userId = client ? (await client.auth.getSession()).data.session?.user.id : undefined;
  if (!userId && ENTITIES_REQUIRING_USER_ID.has(entity) && client !== null) {
    // Pushing this row would violate `user_id not null` + RLS at flush time —
    // refuse it here instead of enqueuing a dead-lettered orphan.
    console.error('[sync] enqueue rejected: protected entity without auth session', {
      entity,
      entityId: row.id,
    });
    throw new Error(`enqueueUpsert(${entity}): no authenticated user to own "${row.id}"`);
  }
  const item: SyncQueueItem = {
    id: uuidv4(),
    entityId: row.id,
    entity,
    op: 'upsert',
    payload: userId ? { ...row, userId } : { ...row },
    createdAt: options.createdAt ?? nowIso(),
    retryCount: 0,
    nextAttemptAt: nowIso(),
  };
  await replacePending(item);
  return item;
}

export async function enqueueRemove(
  entity: EntityName,
  entityId: string,
  rowUpdatedAt: string,
  options: EnqueueOptions = {},
): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: uuidv4(),
    entityId,
    entity,
    op: 'remove',
    payload: { id: entityId, updatedAt: rowUpdatedAt },
    createdAt: options.createdAt ?? nowIso(),
    retryCount: 0,
    nextAttemptAt: nowIso(),
  };
  await replacePending(item);
  return item;
}

export function pendingCount(): Promise<number> {
  return db.syncQueue.count();
}

/** Items whose next attempt is due at or before `at`. */
export async function listDue(at: Date = new Date()): Promise<SyncQueueItem[]> {
  const due = await db.syncQueue.where('nextAttemptAt').belowOrEqual(at.toISOString()).toArray();
  return due.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Record a failed attempt and schedule the next one. */
export async function markFailure(
  item: SyncQueueItem,
  error: unknown,
  options: BackoffOptions = {},
): Promise<SyncQueueItem> {
  const retryCount = item.retryCount + 1;
  const nextAttemptAt = new Date(
    Date.now() + computeBackoffMs(retryCount - 1, options),
  ).toISOString();
  const updated: SyncQueueItem = {
    ...item,
    retryCount,
    lastError: error instanceof Error ? error.message : String(error),
    nextAttemptAt,
  };
  await db.syncQueue.put(updated);
  return updated;
}

export async function markDone(item: SyncQueueItem): Promise<void> {
  await db.syncQueue.delete(item.id);
}

/** An item that exhausted MAX_RETRIES — surfaced as ❌ in the UI. */
export function isDeadLetter(item: SyncQueueItem): boolean {
  return item.retryCount >= MAX_RETRIES;
}

export async function listFailed(): Promise<SyncQueueItem[]> {
  const all = await db.syncQueue.toArray();
  return all.filter((i) => i.retryCount > 0);
}

/**
 * Make every pending item due immediately — called when connectivity
 * returns, so a backoff-scheduled item doesn't wait out its timer.
 */
export async function rescheduleAll(at: Date = new Date()): Promise<void> {
  const iso = at.toISOString();
  await db.syncQueue.toCollection().modify({ nextAttemptAt: iso });
}
