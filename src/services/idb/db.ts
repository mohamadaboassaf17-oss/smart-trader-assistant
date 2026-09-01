/**
 * Dexie database — the single IndexedDB instance for the app.
 *
 * Offline-first rule (PRD §7.1): every read/write goes here first; Supabase
 * is only the sync target once connectivity returns.
 *
 * Schema notes:
 *   - Primary keys are UUID v4 strings (`id`), except `session` (key/value)
 *     and `exchangeRates` (keyed by `date`).
 *   - Indexes listed after the PK are non-unique query helpers only.
 *   - Version 1 is the initial schema; bump the version + add an `upgrade()`
 *     callback for any later change.
 */

import Dexie, { type Table } from 'dexie';

import type {
  DailyNote,
  ExchangeRateEntry,
  Goal,
  GoodsInvoice,
  InventoryMove,
  Obligation,
  ObligationPayment,
  OcrDraft,
  Product,
  Profile,
  Sale,
  SessionRecord,
  SidePurchase,
  Supplier,
  SyncQueueItem,
} from '@/types/domain';

export const DB_NAME = 'trader-assistant';
export const DB_VERSION = 3;

/** Typed handle for every object store in the database. */
export class TraderDb extends Dexie {
  sale!: Table<Sale, string>;
  sidePurchase!: Table<SidePurchase, string>;
  dailyNote!: Table<DailyNote, string>;
  goal!: Table<Goal, string>;
  supplier!: Table<Supplier, string>;
  goodsInvoice!: Table<GoodsInvoice, string>;
  obligation!: Table<Obligation, string>;
  obligationPayment!: Table<ObligationPayment, string>;
  product!: Table<Product, string>;
  inventoryMove!: Table<InventoryMove, string>;
  profile!: Table<Profile, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  session!: Table<SessionRecord, string>;
  exchangeRates!: Table<ExchangeRateEntry, string>;
  ocrDraft!: Table<OcrDraft, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      sale: 'id, userId, date, updatedAt',
      sidePurchase: 'id, userId, date, updatedAt',
      dailyNote: 'id, userId, date, updatedAt',
      goal: 'id, userId, month, updatedAt',
      supplier: 'id, userId, name, updatedAt',
      goodsInvoice: 'id, userId, supplierId, date, updatedAt',
      obligation: 'id, userId, dueDay, updatedAt',
      obligationPayment: 'id, userId, obligationId, month, status, updatedAt',
      product: 'id, userId, name, updatedAt',
      inventoryMove: 'id, userId, productId, direction, updatedAt',
      profile: 'id, userId, updatedAt',
      // Queue scheduling: flush picks items whose nextAttemptAt <= now.
      // [entity+entityId] powers replace-on-enqueue dedupe.
      syncQueue: 'id, entityId, [entity+entityId], nextAttemptAt',
      session: 'key',
      // updatedAt indexed for getLatestRate() (orderBy needs an index).
      exchangeRates: 'date, updatedAt',
    });
    this.version(2).stores({
      ocrDraft: 'id, userId, status, updatedAt',
    });
    this.version(3).stores({
      supplier: 'id, userId, name, updatedAt',
      product: 'id, userId, name, updatedAt',
      goodsInvoice: 'id, userId, supplierId, [userId+supplierId], date, updatedAt',
      inventoryMove: 'id, userId, productId, [userId+productId], direction, updatedAt',
      obligationPayment: 'id, userId, obligationId, [userId+obligationId], month, status, updatedAt',
    });
  }
}

export const db = new TraderDb();
