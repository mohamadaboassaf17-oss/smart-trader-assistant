/**
 * Dashboard aggregation math (financial dashboard, PRD §6.6).
 *
 * Pure, month-scoped sums over **integer USD cents** — same
 * canonical-currency discipline as `@/utils/money` (PRD §6.1). Never
 * floats in or out.
 *
 * PRD §6.6 formula: `dashboard net = gross sales − side purchases − paid
 * obligations`. The net itself delegates to {@link monthlyNetUsdCents} in
 * `@/utils/goal-math` so the Goals advisor and the dashboard can never
 * drift apart; the three total helpers exist because the dashboard renders
 * each component separately before showing the combined figure.
 *
 * Safe-range assumption: every input and every running sum stays within
 * `Number.MAX_SAFE_INTEGER` (about ±$90 trillion), orders of magnitude
 * beyond any real shop's monthly volume. BigInt is deliberately not
 * introduced; callers feeding values past that range own the overflow risk.
 *
 * The integer-cents guard mirrors `goal-math`'s private `assertCents`; it
 * is duplicated here rather than exported so each util keeps its guard
 * self-contained (same rationale as the month-key validator in
 * `obligation-schedule`).
 */

import { monthlyNetUsdCents } from '@/utils/goal-math';

function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${label}: expected integer cents`);
}

function sumCents(values: readonly number[], label: string): number {
  let total = 0;
  for (const cents of values) {
    assertCents(cents, label);
    total += cents;
  }
  return total;
}

/**
 * Gross sales for the month, in USD cents: Σ `saleTotalsOfMonth`.
 * Inputs are readonly and are not mutated; an empty list yields 0.
 */
export function grossSalesUsdCents(saleTotalsOfMonth: readonly number[]): number {
  return sumCents(saleTotalsOfMonth, 'grossSalesUsdCents: sale total');
}

/** Side purchases for the month, in USD cents: Σ `values`. */
export function sidePurchasesTotalUsdCents(values: readonly number[]): number {
  return sumCents(values, 'sidePurchasesTotalUsdCents: side purchase');
}

/** Paid obligations for the month, in USD cents: Σ `values`. */
export function paidObligationsTotalUsdCents(values: readonly number[]): number {
  return sumCents(values, 'paidObligationsTotalUsdCents: paid obligation');
}

/**
 * Month-scoped dashboard net (PRD §6.6):
 * `Σ sales − Σ side purchases − Σ paid obligations`. Delegates to
 * `monthlyNetUsdCents`, which owns both the integer guard and the net
 * definition. Negative results are legitimate and never clamped.
 */
export function dashboardNetUsdCents(
  saleTotalsOfMonth: readonly number[],
  sidePurchaseAmounts: readonly number[],
  paidObligationAmounts: readonly number[],
): number {
  return monthlyNetUsdCents(saleTotalsOfMonth, sidePurchaseAmounts, paidObligationAmounts);
}
