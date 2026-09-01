/**
 * Money utilities.
 *
 * Per PRD §6.1: USD is the canonical currency. All monetary values are
 * stored as **integer cents** (`amount_cents: number`). Never floats.
 *
 * Display only:
 *   - `formatDualCurrency` renders both USD and the local currency
 *     using the user-entered daily exchange rate.
 *   - The local amount is **converted via the persisted daily rate**
 *     that was captured at transaction time, never at display time.
 */

import type { CurrencyCode, LocalCurrencyCode } from '@/types/currency';

/**
 * Convert a human-typed decimal string/number (e.g. "12.34" or 12.34) to cents.
 * Uses banker's rounding (round half to even) to avoid systematic bias.
 */
export function toCents(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new RangeError('toCents: input is not finite');
    return Math.round(input * 100);
  }
  const trimmed = input.trim();
  if (trimmed === '') throw new RangeError('toCents: empty input');
  const num = Number(trimmed);
  if (!Number.isFinite(num)) throw new RangeError(`toCents: not a number (${input})`);
  return Math.round(num * 100);
}

export function fromCents(cents: number): number {
  if (!Number.isInteger(cents)) throw new RangeError('fromCents: expected integer cents');
  return cents / 100;
}

/**
 * Convert a local-currency amount to USD cents using the persisted daily rate.
 * `rate` is local-per-USD (e.g. 89500 for LBP).
 * Returns integer USD cents.
 */
export function localToUsdCents(localCents: number, rate: number): number {
  if (!Number.isInteger(localCents))
    throw new RangeError('localToUsdCents: expected integer local cents');
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('localToUsdCents: invalid rate');
  return Math.round(localCents / rate);
}

/**
 * Sum two day's cash inputs (USD cents + local cents) into a single USD-cents
 * total. This is the daily-sale total formula (PRD §6.1).
 */
export function dayTotalUsdCents(usdCents: number, localCents: number, rate: number): number {
  return usdCents + localToUsdCents(localCents, rate);
}

/** Format integer cents → "1,234.56" (en-US style, no symbol). */
export function formatAmount(cents: number, locale = 'en-US'): string {
  if (!Number.isInteger(cents)) throw new RangeError('formatAmount: expected integer cents');
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Format an amount with its currency symbol/code. */
export function formatMoney(cents: number, currency: CurrencyCode, locale = 'en-US'): string {
  if (!Number.isInteger(cents)) throw new RangeError('formatMoney: expected integer cents');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Display a USD-canonical amount in BOTH the local currency (back-converted
 * via the daily rate) and USD. Useful for dashboard and sale confirmations.
 *
 * Example: `formatDualCurrency(100_00, 'LBP', 89500)` →
 *   "8,950,000 ل.ل  /  $100.00"
 */
export function formatDualCurrency(
  usdCents: number,
  local: LocalCurrencyCode,
  rate: number,
  locale: string = 'ar-LB',
): string {
  if (!Number.isInteger(usdCents)) throw new RangeError('formatDualCurrency: expected integer cents');
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('formatDualCurrency: invalid rate');
  const usdStr = formatMoney(usdCents, 'USD', locale);
  const localCents = Math.round(usdCents * rate);
  const localStr = formatMoney(localCents, local, locale);
  return `${localStr}  /  ${usdStr}`;
}
