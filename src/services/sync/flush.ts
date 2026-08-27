/**
 * Flush + pull — the sync engine (PRD §7.1, §7.2).
 *
 * Push: drain due queue items oldest-first against the remote. Success
 * deletes the item; failure records the error and schedules a backoff retry.
 * A permanently failing item becomes a dead letter (❌ in the UI) but the
 * local row is never destroyed.
 *
 * Pull: fetch remote rows updated since the last successful pull per entity
 * and merge newest-wins by `updatedAt` (stale rejection). Because ids are
 * UUIDs, a merge is always an idempotent upsert.
 */

import { db } from '@/services/idb/db';
import { tryAsync, type Result } from '@/types/result';

import { isDeadLetter, listDue, markDone, markFailure } from './queue';

import type { SyncRemoteClient } from './remote';
import type { EntityName, SyncQueueItem } from '@/types/domain';
import type { Table } from 'dexie';

const LAST_PULL_KEY_PREFIX = 'last_pull_at:';

export interface FlushSummary {
  pushed: number;
  failed: number;
  dead: number;
  pulled: number;
}

function tableFor(entity: EntityName): Table<Record<string, unknown>, string> {
  const t = db[entity] as unknown as Table<Record<string, unknown>, string> | undefined;
  if (!t) throw new Error(`flush: no table for entity "${entity}"`);
  return t;
}

async function lastPullAt(entity: EntityName): Promise<string | undefined> {
  const rec = await db.session.get(LAST_PULL_KEY_PREFIX + entity);
  return rec?.value;
}

async function setLastPullAt(entity: EntityName, iso: string): Promise<void> {
  await db.session.put({
    key: LAST_PULL_KEY_PREFIX + entity,
    value: iso,
    updatedAt: new Date().toISOString(),
  });
}

function isUniqueViolation(error: unknown): boolean {
  const anyErr = error as { code?: unknown; status?: unknown; message?: unknown };
  if (anyErr.code === '23505') return true;
  // PostgREST may surface it as status 409 with 23505 in message
  if (
    anyErr.status === 409 &&
    typeof anyErr.message === 'string' &&
    anyErr.message.includes('23505')
  )
    return true;
  if (
    typeof anyErr.message === 'string' &&
    (anyErr.message.includes('23505') || anyErr.message.includes('duplicate key'))
  )
    return true;
  return false;
}

/** Obligation payment race is idempotent: two devices creating the same
 * (user_id, obligation_id, month) row at month start collide on UNIQUE 23505.
 * Silent reconcile per M7 decision — treat as success, no toast, just warn. */
function isObligationPaymentRace(item: SyncQueueItem, error: unknown): boolean {
  return item.entity === 'obligationPayment' && isUniqueViolation(error);
}

/** Drain every due queue item against the remote. */
export async function pushQueue(
  remote: SyncRemoteClient,
  at: Date = new Date(),
): Promise<Result<FlushSummary, Error>> {
  return tryAsync(async () => {
    const summary: FlushSummary = { pushed: 0, failed: 0, dead: 0, pulled: 0 };
    const due = await listDue(at);
    for (const item of due) {
      try {
        if (item.op === 'upsert') {
          await remote.upsert(item.entity, [item.payload]);
        } else {
          await remote.remove(item.entity, [item.entityId]);
        }
        await markDone(item);
        summary.pushed += 1;
      } catch (error) {
        if (isObligationPaymentRace(item, error)) {
          console.warn('[sync] 23505 reconciled — obligationPayment race treated as success', {
            entity: item.entity,
            entityId: item.entityId,
            month: (item.payload as { month?: string }).month,
          });
          await markDone(item);
          summary.pushed += 1;
          continue;
        }
        const updated = await markFailure(item, error);
        summary.failed += 1;
        if (isDeadLetter(updated)) summary.dead += 1;
      }
    }
    return summary;
  });
}

/**
 * Pull remote changes for `entities` and merge into IndexedDB.
 * Newest-wins on `updatedAt`: a fetched row only overwrites a newer local
 * row when it is itself newer (stale rejection, PRD §7.2 / M2 task).
 */
export async function pullChanges(
  remote: SyncRemoteClient,
  entities: readonly EntityName[],
): Promise<Result<FlushSummary, Error>> {
  return tryAsync(async () => {
    const summary: FlushSummary = { pushed: 0, failed: 0, dead: 0, pulled: 0 };
    const nowIso = new Date().toISOString();
    for (const entity of entities) {
      try {
        const since = (await lastPullAt(entity)) ?? '1970-01-01T00:00:00.000Z';
        const rows = await remote.fetchSince(entity, since);
        const table = tableFor(entity);
        const toWrite: Record<string, unknown>[] = [];
        for (const row of rows) {
          const remoteUpdatedAt = String(row['updatedAt'] ?? '');
          const local = await table.get(String(row['id']));
          if (local && String(local['updatedAt'] ?? '') >= remoteUpdatedAt) continue; // stale remote row — reject
          toWrite.push(row);
        }
        if (toWrite.length > 0) await table.bulkPut(toWrite);
        await setLastPullAt(entity, nowIso);
        summary.pulled += toWrite.length;
      } catch (error) {
        // One missing/broken table (e.g. migration lands in a later milestone)
        // must not abort the whole pull cycle.
        console.error(`[sync] pull failed for "${entity}"`, error);
        summary.failed += 1;
      }
    }
    return summary;
  });
}

export type { SyncQueueItem };
