/**
 * useSuppliers — suppliers feature state (PRD §6.3).
 *
 * Module-scope singleton (same discipline as `useOfflineSync`): every
 * consumer shares one list and one derived-balance pass. Balances are
 * DERIVED, never stored (owner decision 2026-08-23) — each load reads both
 * `db.supplier` and `db.goodsInvoice` and folds the invoices through
 * `sumOutstandingBySupplier`.
 *
 * Mutations ride the standard optimistic sync-queue path via
 * `useOfflineSync().save()/remove()` and refresh the combined list
 * afterwards. Validation failures return typed i18n message keys
 * (`suppliers.*`) so views translate them without string sniffing;
 * persistence failures log structured context and surface as `unknown`.
 */
import { v4 as uuidv4 } from 'uuid';
import { ref, type Ref } from 'vue';

import { useOfflineSync } from '@/composables/useOfflineSync';
import { db } from '@/services/idb/db';
import { err, ok, tryAsync, type Result } from '@/types/result';
import { computeDebtUsdCents } from '@/utils/invoice-math';
import { validateMerchantPhone } from '@/utils/phone';
import { sumOutstandingBySupplier } from '@/utils/supplier-balance';

import type { GoodsInvoice, Supplier, SupplierWithBalance } from '@/types/domain';

/** i18n message keys this feature returns; `unknown` maps to `common.error`. */
export type SupplierErrorKey =
  | 'suppliers.invalidName'
  | 'suppliers.phoneInvalid'
  | 'suppliers.deleteBlocked'
  | 'suppliers.invalidAmount'
  | 'suppliers.overpay'
  | 'unknown';

/** Write-shape for a goods invoice (the debt is computed here, never passed in). */
export interface InvoiceInput {
  supplierId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  totalUsdCents: number;
  paidCashUsdCents: number;
  note?: string;
}

/** Outstanding balance desc, then Arabic-aware name asc. */
function compareRows(a: SupplierWithBalance, b: SupplierWithBalance): number {
  return b.balanceUsdCents - a.balanceUsdCents || a.name.localeCompare(b.name);
}

// ── Singleton state ─────────────────────────────────────────────────────────
const suppliers = ref<SupplierWithBalance[]>([]);
const loading = ref(false);

/** Read both stores and rebuild the derived list. */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const supplierRows = await tryAsync(() => db.supplier.toArray());
    if (!supplierRows.ok) {
      console.error('[suppliers] supplier query failed', { message: supplierRows.error.message });
      return;
    }
    const invoiceRows = await tryAsync(() => db.goodsInvoice.toArray());
    if (!invoiceRows.ok) {
      console.error('[suppliers] invoice query failed', { message: invoiceRows.error.message });
      return;
    }
    const balances = sumOutstandingBySupplier(invoiceRows.value);
    suppliers.value = supplierRows.value
      .map((row) => ({ ...row, balanceUsdCents: balances.get(row.id) ?? 0 }))
      .sort(compareRows);
  } finally {
    loading.value = false;
  }
}

async function saveSupplier(
  input: { name: string; phone?: string },
  existing?: Supplier,
): Promise<Result<void, SupplierErrorKey>> {
  const name = input.name.trim();
  if (name === '') return err('suppliers.invalidName');

  const rawPhone = input.phone?.trim() ?? '';
  let phone: string | undefined;
  if (rawPhone !== '') {
    const parsed = validateMerchantPhone(rawPhone);
    if (!parsed.ok) return err('suppliers.phoneInvalid');
    phone = parsed.value;
  }

  const nowIso = new Date().toISOString();
  const row: Supplier = existing
    ? { ...existing, name, updatedAt: nowIso }
    : { id: uuidv4(), createdAt: nowIso, updatedAt: nowIso, name };
  // An emptied phone field must also clear an already-stored number.
  if (phone === undefined) delete row.phone;
  else row.phone = phone;

  const result = await useOfflineSync().save('supplier', row);
  if (!result.ok) {
    console.error('[suppliers] save failed', { id: row.id, message: result.error.message });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

async function removeSupplier(supplier: Supplier): Promise<Result<void, SupplierErrorKey>> {
  // Guard: a supplier with invoice history cannot be deleted.
  const referenced = await tryAsync(() =>
    db.goodsInvoice.where('supplierId').equals(supplier.id).count(),
  );
  if (!referenced.ok) {
    console.error('[suppliers] invoice lookup failed', {
      id: supplier.id,
      message: referenced.error.message,
    });
    return err('unknown');
  }
  if (referenced.value > 0) return err('suppliers.deleteBlocked');

  const result = await useOfflineSync().remove('supplier', supplier);
  if (!result.ok) {
    console.error('[suppliers] remove failed', { id: supplier.id, message: result.error.message });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

/** That supplier's invoices, newest business day first (then newest entry). */
async function invoicesFor(supplierId: string): Promise<GoodsInvoice[]> {
  const rows = await db.goodsInvoice.where('supplierId').equals(supplierId).toArray();
  return [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

async function saveInvoice(
  input: InvoiceInput,
  existing?: GoodsInvoice,
): Promise<Result<void, SupplierErrorKey>> {
  const debt = computeDebtUsdCents(input.totalUsdCents, input.paidCashUsdCents);
  if (!debt.ok) {
    console.error('[suppliers] invoice rejected by math guard', { kind: debt.error.kind });
    return err(debt.error.kind === 'overpay' ? 'suppliers.overpay' : 'suppliers.invalidAmount');
  }

  const rawNote = input.note?.trim();
  const note = rawNote === '' ? undefined : rawNote;
  const nowIso = new Date().toISOString();
  const row: GoodsInvoice = existing
    ? {
        ...existing,
        supplierId: input.supplierId,
        date: input.date,
        totalUsdCents: input.totalUsdCents,
        paidCashUsdCents: input.paidCashUsdCents,
        debtUsdCents: debt.value,
        note,
        updatedAt: nowIso,
      }
    : {
        id: uuidv4(),
        createdAt: nowIso,
        updatedAt: nowIso,
        supplierId: input.supplierId,
        date: input.date,
        totalUsdCents: input.totalUsdCents,
        paidCashUsdCents: input.paidCashUsdCents,
        debtUsdCents: debt.value,
        note,
      };

  const result = await useOfflineSync().save('goodsInvoice', row);
  if (!result.ok) {
    console.error('[suppliers] invoice save failed', {
      id: row.id,
      message: result.error.message,
    });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

async function removeInvoice(invoice: GoodsInvoice): Promise<Result<void, SupplierErrorKey>> {
  const result = await useOfflineSync().remove('goodsInvoice', invoice);
  if (!result.ok) {
    console.error('[suppliers] invoice remove failed', {
      id: invoice.id,
      message: result.error.message,
    });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

// ── Shared API ──────────────────────────────────────────────────────────────

/** Public surface shared by every `useSuppliers()` caller. */
export interface SuppliersApi {
  /** Combined list — outstanding balance desc, then name asc. */
  suppliers: Ref<SupplierWithBalance[]>;
  loading: Ref<boolean>;
  /** Re-read both stores and rebuild the derived list. */
  refresh(): Promise<void>;
  saveSupplier(
    input: { name: string; phone?: string },
    existing?: Supplier,
  ): Promise<Result<void, SupplierErrorKey>>;
  removeSupplier(supplier: Supplier): Promise<Result<void, SupplierErrorKey>>;
  invoicesFor(supplierId: string): Promise<GoodsInvoice[]>;
  saveInvoice(
    input: InvoiceInput,
    existing?: GoodsInvoice,
  ): Promise<Result<void, SupplierErrorKey>>;
  removeInvoice(invoice: GoodsInvoice): Promise<Result<void, SupplierErrorKey>>;
}

const api: SuppliersApi = {
  suppliers,
  loading,
  refresh: load,
  saveSupplier,
  removeSupplier,
  invoicesFor,
  saveInvoice,
  removeInvoice,
};

let initialized = false;

/** Lazy-load on first access; every caller shares the same state. */
export function useSuppliers(): SuppliersApi {
  if (!initialized) {
    initialized = true;
    void load();
  }
  return api;
}
