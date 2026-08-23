/**
 * Domain entities.
 *
 * Every domain row is stored in IndexedDB (Dexie) and synced to Supabase.
 * The `TName` / `TNameInsert` convention from AGENTS.md is used: `TName` is
 * the full stored row, `TNameInsert` omits the server-managed fields.
 *
 * All rows:
 *   - keyed by a UUID v4 `id`
 *   - carry `createdAt` / `updatedAt` (ISO 8601 strings)
 *   - may carry `userId` once auth lands in M3
 *
 * Multi-device sync is an upsert on `id`; stale writes are rejected by
 * comparing `updatedAt` (see `src/services/sync/flush.ts`).
 */

import type { CountryCode, CurrencyCode, LocalCurrencyCode } from '@/types/currency';

/** All persisted domain stores (also the sync-queue `entity` payloads). */
export type EntityName =
  | 'sale'
  | 'sidePurchase'
  | 'dailyNote'
  | 'goal'
  | 'supplier'
  | 'goodsInvoice'
  | 'obligation'
  | 'obligationPayment'
  | 'product'
  | 'inventoryMove'
  | 'profile';

/** Shared base for all domain rows. */
export interface TBaseRow {
  /** UUID v4. */
  id: string;
  /** ISO 8601 string. */
  createdAt: string;
  /** ISO 8601 string — the sync "version" for stale rejection. */
  updatedAt: string;
  /** Owner; undefined until auth (M3). */
  userId?: string;
}

/** Daily sale — the core Sales flow (PRD §6.1). */
export interface Sale extends TBaseRow {
  /** Business day, `YYYY-MM-DD`. */
  date: string;
  /** USD cash received today, in cents. */
  cashUsdCents: number;
  /** Local cash received today, in local cents. */
  cashLocalCents: number;
  /** Local-per-USD rate captured at transaction time (e.g. 89500). */
  exchangeRate: number;
  /** `cashUsdCents + round(cashLocalCents / exchangeRate)`, in USD cents. */
  totalUsdCents: number;
}

export type SaleInsert = Omit<Sale, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** A side purchase (non-goods expense). */
export interface SidePurchase extends TBaseRow {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Amount in the transaction currency, in cents. */
  amountCents: number;
  /** The currency the amount is expressed in. */
  currency: CurrencyCode;
  /** Local-per-USD rate at purchase time (only meaningful for LBP/SYP). */
  exchangeRate: number;
  /** `round(amountCents / exchangeRate)` when local, else `amountCents`. */
  amountUsdCents: number;
  note?: string;
}

export type SidePurchaseInsert = Omit<SidePurchase, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** A free-form daily note (Notes feature). */
export interface DailyNote extends TBaseRow {
  /** `YYYY-MM-DD`. */
  date: string;
  body: string;
}

export type DailyNoteInsert = Omit<DailyNote, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** A monthly sales target (Goals feature). */
export interface Goal extends TBaseRow {
  /** Target month, `YYYY-MM`. */
  month: string;
  /** Target total sales in USD cents. */
  targetUsdCents: number;
}

export type GoalInsert = Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** A supplier (Suppliers feature). */
export interface Supplier extends TBaseRow {
  name: string;
  phone?: string;
  /** Running debt to this supplier, in USD cents. */
  balanceUsdCents: number;
}

export type SupplierInsert = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** An invoice for goods received from a supplier (Purchases feature). */
export interface GoodsInvoice extends TBaseRow {
  /** FK → supplier.id. */
  supplierId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Invoice total, in USD cents. */
  totalUsdCents: number;
  /** Portion paid in cash, in USD cents. */
  paidCashUsdCents: number;
  /** `totalUsdCents - paidCashUsdCents`, in USD cents. */
  debtUsdCents: number;
  note?: string;
}

export type GoodsInvoiceInsert = Omit<GoodsInvoice, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** A recurring obligation (rent, electricity, phone — Obligations feature). */
export interface Obligation extends TBaseRow {
  name: string;
  /** Monthly amount, in USD cents. */
  amountUsdCents: number;
  /** Day of month the obligation is due, 1–31. */
  dueDay: number;
  active: boolean;
}

export type ObligationInsert = Omit<Obligation, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** Payment status for an obligation in a given month. */
export type ObligationPaymentStatus = 'pending' | 'paid';

/** Tracks whether an obligation was paid for a specific month. */
export interface ObligationPayment extends TBaseRow {
  /** FK → obligation.id. */
  obligationId: string;
  /** `YYYY-MM`. */
  month: string;
  status: ObligationPaymentStatus;
  /** ISO 8601 string; set when status becomes `paid`. */
  paidAt?: string;
}

export type ObligationPaymentInsert = Omit<
  ObligationPayment,
  'id' | 'createdAt' | 'updatedAt' | 'userId'
>;

/** Direction of an inventory move between shelf and warehouse. */
export type InventoryMoveDirection = 'shelfToWarehouse' | 'warehouseToShelf';

/** A product tracked in inventory (Goods feature). */
export interface Product extends TBaseRow {
  name: string;
  /** Quantity currently on the shelf. */
  shelfQty: number;
  /** Quantity currently in the warehouse. */
  warehouseQty: number;
}

export type ProductInsert = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** A quantity move between shelf and warehouse for a product. */
export interface InventoryMove extends TBaseRow {
  /** FK → product.id. */
  productId: string;
  direction: InventoryMoveDirection;
  quantity: number;
}

export type InventoryMoveInsert = Omit<InventoryMove, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** The single user profile (which market: LB or SY). */
export interface Profile extends TBaseRow {
  country: CountryCode;
  localCurrency: LocalCurrencyCode;
  subscriptionStatus: 'trial' | 'active' | 'expired';
  /** ISO 8601 string; undefined while subscription is on trial/expired. */
  subscriptionExpiresAt?: string;
}

export type ProfileInsert = Omit<Profile, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/**
 * One exchange rate per business day.
 * Stored with PK `date` (`YYYY-MM-DD`), keyed in Dexie store `exchangeRates`.
 */
export interface ExchangeRateEntry {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Local-per-USD rate (e.g. 89500). */
  rate: number;
  /** ISO 8601 string. */
  updatedAt: string;
}

export type ExchangeRateEntryInsert = Omit<ExchangeRateEntry, 'updatedAt'>;

/**
 * Sync queue item (AGENTS.md shape, extended with `nextAttemptAt` + `entityId`
 * for exponential backoff scheduling and stale-rejection bookkeeping).
 */
export interface SyncQueueItem {
  /** UUID v4 — the queue item's own id (not the entity's). */
  id: string;
  /** Local row id that this item pushes. */
  entityId: string;
  /** Store the op targets. */
  entity: EntityName;
  /** `upsert` (create/update) or `remove` (delete). */
  op: 'upsert' | 'remove';
  /** The full local row to push (for `remove`, a `{ id, updatedAt }` stub). */
  payload: Record<string, unknown>;
  /** ISO 8601 string. */
  createdAt: string;
  /** Number of failed attempts so far (drives backoff). */
  retryCount: number;
  /** Human-readable last error, kept for diagnostics/UI. */
  lastError?: string;
  /** ISO 8601 string; item is only flushed when `nextAttemptAt <= now`. */
  nextAttemptAt: string;
}

/** A key/value row in the `session` store (JWT, tokens, last-heartbeat). */
export interface SessionRecord {
  /** e.g. `'supabase_token'`, `'supabase_refresh_token'`. */
  key: string;
  value: string;
  /** ISO 8601 string. */
  updatedAt: string;
}

export type SessionRecordInsert = Omit<SessionRecord, 'updatedAt'>;
