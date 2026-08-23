/**
 * Currency codes accepted by the app.
 * - `CurrencyCode` is the full ISO 4217 set used by `formatMoney`.
 * - `LocalCurrencyCode` is the subset that pairs with USD in the
 *   Lebanon / Syria markets (PRD §5).
 */

export type CurrencyCode = 'USD' | 'LBP' | 'SYP' | 'EUR' | 'GBP';

/** Currencies available as the user's "local" currency in MVP. */
export type LocalCurrencyCode = 'LBP' | 'SYP';

export const COUNTRIES = ['LB', 'SY'] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export const LOCAL_CURRENCY_BY_COUNTRY: Record<CountryCode, LocalCurrencyCode> = {
  LB: 'LBP',
  SY: 'SYP',
};

/** Arabic display label per local currency. */
export const LOCAL_CURRENCY_LABEL: Record<LocalCurrencyCode, string> = {
  LBP: 'ل.ل',
  SYP: 'ل.س',
};

/** Default market until onboarding (M3) sets the real one. */
export const DEFAULT_COUNTRY: CountryCode = 'LB';
