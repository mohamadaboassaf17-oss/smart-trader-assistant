/**
 * Optimistic UI helper (PRD §7.3).
 *
 * Writes the row to IndexedDB immediately and enqueues the remote op. If
 * either step fails, the previous local state is restored (rollback) so the
 * screen never shows a value that was not durably stored.
 */

import { db } from '@/services/idb/db';
import { err, ok, type Result } from '@/types/result';

import { enqueueRemove, enqueueUpsert } from './queue';

import type { EntityName, TBaseRow } from '@/types/domain';
import type { Table } from 'dexie';

type EnqueueUpsertFn = (row: TBaseRow, entity: EntityName) => Promise<unknown>;
type EnqueueRemoveFn = (
  entity: EntityName,
  entityId: string,
  rowUpdatedAt: string,
) => Promise<unknown>;

function tableFor(entity: EntityName): Table<Record<string, unknown>, string> {
  const t = db[entity] as unknown as Table<Record<string, unknown>, string> | undefined;
  if (!t) throw new Error(`applyOptimistic: no table for entity "${entity}"`);
  return t;
}

/** Write `row` locally + queue its upsert; rollback on any failure. */
export async function applyOptimisticPut<T extends TBaseRow>(
  entity: EntityName,
  row: T,
  enqueue: EnqueueUpsertFn = enqueueUpsert,
): Promise<Result<void, Error>> {
  const table = tableFor(entity);
  const previous = await table.get(row.id);
  try {
    await table.put(row as unknown as Record<string, unknown>);
    await enqueue(row, entity);
    return ok(undefined);
  } catch (e) {
    try {
      if (previous === undefined) await table.delete(row.id);
      else await table.put(previous);
    } catch (rollbackError) {
      console.error(`[optimistic] rollback failed for ${entity}/${row.id}`, rollbackError);
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/** Delete locally + queue the remote delete; restore on failure. */
export async function applyOptimisticRemove(
  entity: EntityName,
  row: TBaseRow,
  enqueue: EnqueueRemoveFn = enqueueRemove,
): Promise<Result<void, Error>> {
  const table = tableFor(entity);
  const previous = await table.get(row.id);
  try {
    await table.delete(row.id);
    await enqueue(entity, row.id, row.updatedAt);
    return ok(undefined);
  } catch (e) {
    try {
      if (previous !== undefined) await table.put(previous);
    } catch (rollbackError) {
      console.error(`[optimistic] rollback failed for ${entity}/${row.id}`, rollbackError);
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
