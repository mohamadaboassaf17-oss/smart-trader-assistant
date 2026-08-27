/**
 * Paid-obligation join (financial dashboard + goals advisor, PRD §6.6).
 *
 * Data-model fact: `ObligationPayment` rows carry STATUS ONLY — the money
 * lives on the parent obligation (`amountUsdCents`). Valuing a month's
 * paid obligations therefore means JOINing each `paid` payment row back to
 * its parent's amount. Payment rows whose parent is missing or deleted are
 * skipped defensively so an orphaned row can neither inflate the total nor
 * crash the caller.
 *
 * Pure over the passed snapshots — storage stays with the callers (the
 * `useObligations()` singleton refs), matching `supplier-balance`'s
 * derived-not-stored discipline.
 */

import type { Obligation, ObligationPayment } from '@/types/domain';

/**
 * USD-cent amounts of every obligation PAID in `month`, input order of
 * `payments` preserved. Pending/unpaid rows contribute nothing; a missing
 * parent obligation silently drops its payment row.
 */
export function paidObligationAmountsForMonth(
  obligations: readonly Obligation[],
  payments: readonly ObligationPayment[],
  month: string,
): number[] {
  const amountByObligationId = new Map(obligations.map((row) => [row.id, row.amountUsdCents]));
  const amounts: number[] = [];
  for (const payment of payments) {
    if (payment.month !== month || payment.status !== 'paid') continue;
    const amountUsdCents = amountByObligationId.get(payment.obligationId);
    if (amountUsdCents === undefined) continue; // orphaned payment row
    amounts.push(amountUsdCents);
  }
  return amounts;
}
