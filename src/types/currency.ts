/**
 * Currency codes accepted by the app.
 * - `CurrencyCode` is the full ISO 4217 set used by `formatMoney`.
 * - `LocalCurrencyCode` is the subset that pairs with USD in the
 *   Lebanon / Syria markets (PRD §5).
 */

export type CurrencyCode = 'USD' | 'LBP' | 'SYP' | 'IQD' | 'EGP' | 'LYD' | 'EUR' | 'GBP';

/** Currencies available as the user's "local" currency. */
export type LocalCurrencyCode = 'LBP' | 'SYP' | 'IQD';

export const COUNTRIES = ['LB', 'SY', 'IQ'] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export const LOCAL_CURRENCY_BY_COUNTRY: Record<CountryCode, LocalCurrencyCode> = {
  LB: 'LBP',
  SY: 'SYP',
  IQ: 'IQD',
};

/** Arabic display label per local currency. */
export const LOCAL_CURRENCY_LABEL: Record<LocalCurrencyCode, string> = {
  LBP: 'ل.ل',
  SYP: 'ل.س',
  IQD: 'ع.د',
};

/** Full set for future markets (EG/LY) — not yet local-selectable in M9. */
export const ALL_LOCAL_LABELS: Record<string, string> = {
  ...LOCAL_CURRENCY_LABEL,
  EGP: 'ج.م',
  LYD: 'د.ل',
};

/**
 * Peg rates for fixed-rate markets (local-per-USD). Null = floating/manual.
 * IQD peg قابل للتحديث عبر متغير البيئة `VITE_IQD_PEG` بدون إعادة نشر كود
 * (يتطلب إعادة بناء فقط) — القيمة الافتراضية 1310.
 */
export function getIqdPeg(): number {
  const raw = Number(import.meta.env.VITE_IQD_PEG ?? '1310');
  return Number.isFinite(raw) ? raw : 1310;
}

export const IQD_PEG = getIqdPeg();

export const PEG_RATE_BY_COUNTRY: Record<CountryCode, number | null> = {
  LB: null,
  SY: null,
  IQ: getIqdPeg(),
};

/** Default market until onboarding (M3) sets the real one. */
export const DEFAULT_COUNTRY: CountryCode = 'LB';
