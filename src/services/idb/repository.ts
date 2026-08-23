/**
 * Generic typed CRUD over a Dexie table.
 *
 * Repositories are thin: they throw on storage failure and let callers wrap
 * results in `Result<T, E>` at the service/composable boundary. Every domain
 * row is keyed by its UUID `id`, so a remote upsert is always
 * `bulkPut` on that key (multi-device sync, PRD §7.2).
 */

import type { TBaseRow } from '@/types/domain';
import type { Table } from 'dexie';

export interface Repository<T extends TBaseRow> {
  /** Fetch one row by id, or undefined when missing. */
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  /** All rows where `field === value` (requires an index in db.ts). */
  where(field: string, value: string | number): Promise<T[]>;
  put(row: T): Promise<string>;
  bulkPut(rows: T[]): Promise<string>;
  remove(id: string): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export function createRepository<T extends TBaseRow>(table: Table<T, string>): Repository<T> {
  return {
    get(id) {
      return table.get(id);
    },
    getAll() {
      return table.toArray();
    },
    async where(field, value) {
      if (!table.schema.indexes.some((ix) => ix.name === field)) {
        throw new Error(`repository.where: "${field}" is not indexed on ${table.name}`);
      }
      return table.where(field).equals(value).toArray();
    },
    put(row) {
      return table.put(row);
    },
    bulkPut(rows) {
      return table.bulkPut(rows);
    },
    async remove(id) {
      await table.delete(id);
    },
    count() {
      return table.count();
    },
    clear() {
      return table.clear();
    },
  };
}
