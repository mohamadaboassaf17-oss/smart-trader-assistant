/**
 * Supplier outstanding-balance aggregation (Suppliers feature).
 *
 * The supplier's balance is **derived, never stored** (owner decision
 * 2026-08-23): it is the sum of `debtUsdCents` across the supplier's
 * goods-invoice rows. Pure functions over integer USD cents — PRD §6.1.
 *
 * Row shape is trusted (rows come from the typed Dexie/Supabase layer);
 * nothing is silently skipped — every invoice contributes its debt.
 */

import type { GoodsInvoice } from '@/types/domain';

/** A domain entity id (UUID v4 string). */
export type Id = string;

/**
 * Outstanding debt per supplier, in USD cents.
 *
 * Every invoice in `invoices` is accounted for: suppliers appear as map
 * keys even when their total debt is 0. Inputs are readonly and are not
 * mutated; an empty list yields an empty map.
 */
export function sumOutstandingBySupplier(invoices: readonly GoodsInvoice[]): Map<Id, number> {
  const totals = new Map<Id, number>();
  for (const invoice of invoices) {
    const current = totals.get(invoice.supplierId) ?? 0;
    totals.set(invoice.supplierId, current + invoice.debtUsdCents);
  }
  return totals;
}

/**
 * Outstanding debt for a single supplier, in USD cents. Convenience over
 * {@link sumOutstandingBySupplier} for detail views; returns 0 when the
 * supplier has no invoices at all.
 */
export function outstandingForSupplier(invoices: readonly GoodsInvoice[], supplierId: Id): number {
  let total = 0;
  for (const invoice of invoices) {
    if (invoice.supplierId === supplierId) total += invoice.debtUsdCents;
  }
  return total;
}
