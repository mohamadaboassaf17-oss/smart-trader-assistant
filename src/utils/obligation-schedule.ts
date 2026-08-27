/**
 * Monthly pending-obligation payment generation (Obligations feature, M6).
 *
 * Pure functions only — no storage, no network. The caller (a later
 * composable) owns identity: the returned drafts carry NO `id`,
 * `createdAt` / `updatedAt`; UUID v4 assignment and persistence happen at
 * write time, outside this module.
 *
 * Idempotency contract: uniqueness does NOT come from these functions.
 * It is enforced by the DB UNIQUE constraint `(user_id, obligation_id,
 * month)` plus client-side existence checks before insert — re-running
 * generation for the same month is therefore safe and expected.
 *
 * Due-day semantics: `dueDay` is display/sort-only metadata. Generation
 * is per-month, not per-due-date, so an obligation due day 31 still
 * appears pending in February. This mirrors the product decision that
 * nothing auto-deducts — payments are recorded manually, one month at a
 * time.
 */

import type { Obligation } from '@/types/domain';

/**
 * `YYYY-MM`, zero-padded, months 01–12. Duplicated locally rather than
 * imported from `goal-math`: that module validates full dates
 * (`YYYY-MM-DD`) and keeps its parser private, so sharing would couple
 * two unrelated features over a single line of regex.
 */
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True when `value` is a well-formed month key (`YYYY-MM`, months 01–12). */
export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value);
}

function assertMonthKey(month: string, label: string): void {
  if (!MONTH_KEY_PATTERN.test(month))
    throw new RangeError(`${label}: expected YYYY-MM, got "${month}"`);
}

/**
 * Current calendar month as `YYYY-MM` (zero-padded), derived from `now`
 * (defaults to the real clock) so callers can inject a fixed date in tests.
 * Throws `RangeError` for an invalid `Date`.
 */
export function currentMonthKey(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) throw new RangeError('currentMonthKey: invalid Date');
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** A payment row-to-be: everything except the caller-owned identity fields. */
export interface PendingPaymentDraft {
  /** FK → obligation.id. */
  obligationId: string;
  /** Target month, `YYYY-MM`. */
  month: string;
}

/**
 * Drafts for every ACTIVE obligation in `month`, input order preserved.
 * Inactive obligations are skipped silently by design (deactivation means
 * "stop generating", never "delete history"). Throws `RangeError` on a
 * malformed `month`; empty input yields `[]`.
 */
export function pendingPaymentsForMonth(
  obligations: readonly Pick<Obligation, 'id' | 'active'>[],
  month: string,
): PendingPaymentDraft[] {
  assertMonthKey(month, 'pendingPaymentsForMonth');
  const drafts: PendingPaymentDraft[] = [];
  for (const obligation of obligations) {
    if (!obligation.active) continue;
    drafts.push({ obligationId: obligation.id, month });
  }
  return drafts;
}
