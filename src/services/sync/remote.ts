/**
 * Remote sync client.
 *
 * `SyncRemoteClient` is the transport contract; the app-level queue only
 * knows this interface, so tests inject fakes and the production build gets
 * the Supabase implementation.
 *
 * Column naming: DB rows are snake_case (AGENTS.md), JS rows are camelCase.
 * `createSupabaseRemote` converts keys recursively in both directions.
 */

import type { EntityName, TBaseRow } from '@/types/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

/** snake_case singular table names (AGENTS.md DB convention). */
export const TABLE_BY_ENTITY: Record<EntityName, string> = {
  sale: 'sale',
  sidePurchase: 'side_purchase',
  dailyNote: 'daily_note',
  goal: 'goal',
  supplier: 'supplier',
  goodsInvoice: 'goods_invoice',
  obligation: 'obligation',
  obligationPayment: 'obligation_payment',
  product: 'product',
  inventoryMove: 'inventory_move',
  profile: 'profile',
};

export interface SyncRemoteClient {
  /** Upsert rows by UUID `id` (multi-device sync, PRD §7.2). */
  upsert(entity: EntityName, rows: Record<string, unknown>[]): Promise<void>;
  /** Hard-delete by ids. */
  remove(entity: EntityName, ids: string[]): Promise<void>;
  /** Rows for `entity` updated strictly after `sinceIso` (stale rejection). */
  fetchSince(entity: EntityName, sinceIso: string): Promise<Record<string, unknown>[]>;
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function mapKeysDeep(
  value: unknown,
  transform: (key: string) => string,
  skipKeys: ReadonlySet<string> = new Set(['id', 'userId', 'user_id']),
): unknown {
  if (Array.isArray(value)) return value.map((v) => mapKeysDeep(v, transform, skipKeys));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[transform(k)] = mapKeysDeep(v, transform, skipKeys);
    }
    return out;
  }
  return value;
}

export function createSupabaseRemote(client: SupabaseClient): SyncRemoteClient {
  return {
    async upsert(entity, rows) {
      if (rows.length === 0) return;
      const table = TABLE_BY_ENTITY[entity];
      const payload = rows.map((r) => mapKeysDeep(r, camelToSnake));
      const { error } = await client.from(table).upsert(payload, { onConflict: 'id' });
      if (error) throw new Error(`remote.upsert(${entity}): ${error.message}`);
    },

    async remove(entity, ids) {
      if (ids.length === 0) return;
      const table = TABLE_BY_ENTITY[entity];
      const { error } = await client.from(table).delete().in('id', ids);
      if (error) throw new Error(`remote.remove(${entity}): ${error.message}`);
    },

    async fetchSince(entity, sinceIso) {
      const table = TABLE_BY_ENTITY[entity];
      const { data, error } = await client
        .from(table)
        .select('*')
        .gt('updated_at', sinceIso)
        .order('updated_at', { ascending: true });
      if (error) throw new Error(`remote.fetchSince(${entity}): ${error.message}`);
      return (data ?? []).map((r) => mapKeysDeep(r, snakeToCamel) as Record<string, unknown>);
    },
  };
}

/** Narrow an unknown fetched row to a TBaseRow-shaped object. */
export function asRow(row: Record<string, unknown>): TBaseRow {
  return {
    id: String(row['id']),
    createdAt: String(row['createdAt'] ?? ''),
    updatedAt: String(row['updatedAt'] ?? ''),
    ...(row['userId'] === undefined ? {} : { userId: String(row['userId']) }),
  };
}
