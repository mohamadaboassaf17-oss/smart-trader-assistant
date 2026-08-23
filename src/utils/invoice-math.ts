/**
 * Invoice debt math (Purchases feature).
 *
 * Pure functions over **integer USD cents** — same canonical-currency
 * discipline as `@/utils/money` (PRD §6.1). Never floats in or out.
 *
 * Unlike `goal-math`, expected failures are returned as typed error
 * variants (never thrown) so the UI can map them to Arabic locale keys
 * without string sniffing. See `@/types/result` for the Result contract.
 */

import { err, ok, type Result } from '@/types/result';

/** Typed failure modes of `computeDebtUsdCents`; UI maps each to a locale key. */
export type InvoiceMathError =
  | { kind: 'negativeTotal' }
  | { kind: 'negativePaid' }
  | { kind: 'overpay' }
  | { kind: 'nonIntegerCents' };

/**
 * Remaining debt for a partially-paid goods invoice, in USD cents:
 * `total − paidCash`. Guards run in order: non-integers first (so a
 * fractional or non-finite input is reported as such), then negatives,
 * then overpayment. Success is `total − paid`, never negative.
 */
export function computeDebtUsdCents(
  totalUsdCents: number,
  paidCashUsdCents: number,
): Result<number, InvoiceMathError> {
  if (!Number.isInteger(totalUsdCents) || !Number.isInteger(paidCashUsdCents))
    return err({ kind: 'nonIntegerCents' });
  if (totalUsdCents < 0) return err({ kind: 'negativeTotal' });
  if (paidCashUsdCents < 0) return err({ kind: 'negativePaid' });
  if (paidCashUsdCents > totalUsdCents) return err({ kind: 'overpay' });
  return ok(totalUsdCents - paidCashUsdCents);
}
