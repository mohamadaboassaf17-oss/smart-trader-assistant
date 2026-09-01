/**
 * useInventory — inventory feature state (PRD §6.4).
 *
 * Module-scope singleton (same discipline as `useSuppliers`): one shared,
 * name-sorted product list. Mutations ride the standard optimistic
 * sync-queue path via `useOfflineSync().save()/remove()`. Validation and
 * math-guard failures return typed i18n message keys (`inventory.*`) so
 * views translate them without string sniffing; persistence failures log
 * structured context and surface as `unknown`.
 */
import { v4 as uuidv4 } from 'uuid';
import { ref, type Ref } from 'vue';

import { useOfflineSync } from '@/composables/useOfflineSync';
import { inventoryMoveSchema, productInsertSchema } from '@/schemas';
import { db } from '@/services/idb/db';
import { getSupabase } from '@/services/supabase/client';
import { err, ok, tryAsync, type Result } from '@/types/result';
import { applyInventoryMove, type InventoryMoveError } from '@/utils/inventory-math';

import type { InventoryMove, InventoryMoveDirection, Product } from '@/types/domain';

/** i18n message keys this feature returns; `unknown` maps to `common.error`. */
export type InventoryErrorKey =
  | 'inventory.invalidName'
  | 'inventory.invalidQty'
  | 'inventory.insufficient'
  | 'unknown';

/** Write-shape for a product; omitted quantities default to 0. */
export interface ProductInput {
  name: string;
  shelfQty?: number;
  warehouseQty?: number;
}

/** Write-shape for a manual shelf↔warehouse move. */
export interface StockMoveInput {
  productId: string;
  direction: InventoryMoveDirection;
  quantity: number;
}

/** Map a math-guard rejection onto its user-facing i18n key. */
function moveErrorKey(error: InventoryMoveError): InventoryErrorKey {
  switch (error.kind) {
    case 'insufficientShelf':
    case 'insufficientWarehouse':
      return 'inventory.insufficient';
    case 'nonIntegerQty':
    case 'nonPositiveQty':
      return 'inventory.invalidQty';
  }
}

// ── Singleton state ─────────────────────────────────────────────────────────
const products = ref<Product[]>([]);
const loading = ref(false);

async function getAuthContext(): Promise<{ uid: string | null; isOfflineOnly: boolean }> {
  const client = getSupabase();
  if (!client) return { uid: null, isOfflineOnly: true };
  try {
    const session = (await client.auth.getSession()).data.session;
    if (session?.user.id) return { uid: session.user.id, isOfflineOnly: false };
  } catch {
    // offline
  }
  return { uid: null, isOfflineOnly: false };
}

async function getCurrentUid(): Promise<string | null> {
  const ctx = await getAuthContext();
  return ctx.uid;
}

/** Read the store and rebuild the name-sorted list. */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const ctx = await getAuthContext();
    if (!ctx.isOfflineOnly && !ctx.uid) {
      products.value = [];
      return;
    }
    const rows = await tryAsync(() =>
      ctx.isOfflineOnly || !ctx.uid
        ? db.product.toArray()
        : db.product.where('userId').equals(ctx.uid).toArray(),
    );
    if (!rows.ok) {
      console.error('[inventory] product query failed', { message: rows.error.message });
      return;
    }
    products.value = [...rows.value].sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    loading.value = false;
  }
}

async function saveProduct(
  input: ProductInput,
  existing?: Product,
): Promise<Result<void, InventoryErrorKey>> {
  // Central Zod validation before db.product.put (P1.5) — name/qty
  const parsed = productInsertSchema.safeParse({
    name: input.name,
    shelfQty: input.shelfQty ?? 0,
    warehouseQty: input.warehouseQty ?? 0,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.path[0];
    if (issue === 'name') return err('inventory.invalidName');
    return err('inventory.invalidQty');
  }
  const name = parsed.data.name;
  const shelfQty = parsed.data.shelfQty;
  const warehouseQty = parsed.data.warehouseQty;

  const nowIso = new Date().toISOString();
  const row: Product = existing
    ? { ...existing, name, shelfQty, warehouseQty, updatedAt: nowIso }
    : { id: uuidv4(), createdAt: nowIso, updatedAt: nowIso, name, shelfQty, warehouseQty };

  const result = await useOfflineSync().save('product', row);
  if (!result.ok) {
    console.error('[inventory] save failed', { id: row.id, message: result.error.message });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

async function removeProduct(product: Product): Promise<Result<void, InventoryErrorKey>> {
  // Products have no dependent rows blocking deletion. Remote inventoryMove
  // rows cascade away via the database FK; locally we leave them in place —
  // a stale audit trail for a deleted product is harmless history.
  const result = await useOfflineSync().remove('product', product);
  if (!result.ok) {
    console.error('[inventory] remove failed', { id: product.id, message: result.error.message });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

async function moveStock(input: StockMoveInput): Promise<Result<void, InventoryErrorKey>> {
  // Central Zod validation before put (P1.5) — quantity
  const parsedMove = inventoryMoveSchema.safeParse(input);
  if (!parsedMove.success) return err('inventory.invalidQty');
  const uid = await getCurrentUid();
  const found = await tryAsync(async () => {
    const row = await db.product.get(input.productId);
    if (row && uid && row.userId !== uid) return undefined;
    return row;
  });
  if (!found.ok) {
    console.error('[inventory] product lookup failed', {
      id: input.productId,
      message: found.error.message,
    });
    return err('unknown');
  }
  const current = found.value;
  if (!current) {
    console.error('[inventory] product not found', { id: input.productId });
    return err('unknown');
  }

  const applied = applyInventoryMove(current, input.direction, input.quantity);
  if (!applied.ok) {
    console.error('[inventory] move rejected by math guard', { kind: applied.error.kind });
    return err(moveErrorKey(applied.error));
  }

  // Persist the corrected product row FIRST; the audit move row follows. If
  // the audit write fails we surface the error WITHOUT rolling back the
  // stock change — losing the audit entry is acceptable, losing the move
  // itself is not.
  const savedProduct = await useOfflineSync().save('product', applied.value);
  if (!savedProduct.ok) {
    console.error('[inventory] product save failed', {
      id: applied.value.id,
      message: savedProduct.error.message,
    });
    return err('unknown');
  }

  const nowIso = new Date().toISOString();
  const moveRow: InventoryMove = {
    id: uuidv4(),
    createdAt: nowIso,
    updatedAt: nowIso,
    productId: input.productId,
    direction: input.direction,
    quantity: input.quantity,
  };
  const savedMove = await useOfflineSync().save('inventoryMove', moveRow);
  if (!savedMove.ok) {
    console.error('[inventory] move audit save failed', {
      id: moveRow.id,
      message: savedMove.error.message,
    });
    return err('unknown');
  }

  await load();
  return ok(undefined);
}

/** That product's moves, newest first (audit trail). */
async function movesFor(productId: string): Promise<InventoryMove[]> {
  const uid = await getCurrentUid();
  let rows: InventoryMove[];
  if (uid) {
    try {
      rows = await db.inventoryMove.where('[userId+productId]').equals([uid, productId]).toArray();
    } catch {
      rows = await db.inventoryMove
        .where('userId')
        .equals(uid)
        .filter((r) => r.productId === productId)
        .toArray();
    }
  } else {
    rows = await db.inventoryMove.where('productId').equals(productId).toArray();
  }
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Shared API ──────────────────────────────────────────────────────────────

/** Public surface shared by every `useInventory()` caller. */
export interface InventoryApi {
  /** All products, name asc. */
  products: Ref<Product[]>;
  loading: Ref<boolean>;
  /** Re-read the store and rebuild the list. */
  refresh(): Promise<void>;
  saveProduct(input: ProductInput, existing?: Product): Promise<Result<void, InventoryErrorKey>>;
  removeProduct(product: Product): Promise<Result<void, InventoryErrorKey>>;
  moveStock(input: StockMoveInput): Promise<Result<void, InventoryErrorKey>>;
  movesFor(productId: string): Promise<InventoryMove[]>;
}

const api: InventoryApi = {
  products,
  loading,
  refresh: load,
  saveProduct,
  removeProduct,
  moveStock,
  movesFor,
};

let initialized = false;

/** Lazy-load on first access; every caller shares the same state. */
export function useInventory(): InventoryApi {
  if (!initialized) {
    initialized = true;
    void load();
  }
  return api;
}
