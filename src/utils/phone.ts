/**
 * Merchant phone validation for the PRD audience (Lebanon + Syria).
 *
 * Pure parsing/validation — no locale strings, no side effects; the UI maps
 * {@link MerchantPhoneError} variants onto Arabic copy via i18n keys.
 *
 * Accepted shapes (spaces, dashes, parentheses stripped first):
 *   - Local LB mobile: `3` + 6 digits (7 digits) or `70|71|76|78|79|81` +
 *     6 digits (8 digits); an optional trunk `0` may precede (`03######`).
 *   - Local SY mobile: `9` + 8 digits (9 digits total); optional trunk `0`.
 *   - International: optional `+` plus country code 961 (LB) or 963 (SY)
 *     followed by the local part; a stray trunk `0` there is tolerated
 *     and normalized away.
 *
 * Success yields the normalized E.164-style form, always `+961…` / `+963…`,
 * so the output is idempotent under re-validation.
 */

import { err, ok, type Result } from '@/types/result';

/** Characters tolerated inside a typed number and ignored entirely. */
const NOISE_PATTERN = /[\s\-().]/g;

/** LB local mobiles: trunk-optional prefix + exactly 6 more digits. */
const LEBANON_LOCAL_PATTERN = /^0?(?:3\d{6}|(?:70|71|76|78|79|81)\d{6})$/;

/** SY local mobiles: trunk-optional `9` + exactly 8 more digits. */
const SYRIA_LOCAL_PATTERN = /^0?9\d{8}$/;

/** Typed failure modes of `validateMerchantPhone`; UI maps each to a locale key. */
export type MerchantPhoneError =
  | { kind: 'empty' }
  | { kind: 'invalidFormat' }
  | { kind: 'unknownCountry' };

interface CountryPlan {
  /** ITU country code without `+`. */
  countryCode: '961' | '963';
  /** Pattern over the local part (after any trunk zero). */
  localPattern: RegExp;
}

const PLANS: readonly CountryPlan[] = [
  { countryCode: '961', localPattern: LEBANON_LOCAL_PATTERN },
  { countryCode: '963', localPattern: SYRIA_LOCAL_PATTERN },
];

/**
 * Validate a merchant phone number and return its normalized
 * E.164-style form (`+961…` / `+963…`) on success.
 *
 * A `+`-prefixed number whose leading digits are neither `961` nor `963`
 * fails as `{ kind: 'unknownCountry' }`; a well-formed-but-wrong-length
 * or garbage-bearing input fails as `{ kind: 'invalidFormat' }`. Bare
 * locals that match neither country's pattern also fail as
 * `{ kind: 'invalidFormat' }` (country is undeterminable, not foreign).
 */
export function validateMerchantPhone(raw: string): Result<string, MerchantPhoneError> {
  const cleaned = raw.replace(NOISE_PATTERN, '');
  if (cleaned === '' || cleaned === '+') return err({ kind: 'empty' });

  const international = cleaned.startsWith('+');
  const digits = international ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(digits)) return err({ kind: 'invalidFormat' });

  // An explicit country code claims the number: it must fully match that
  // country's pattern, otherwise the failure is structural, not unknown.
  for (const plan of PLANS) {
    if (!digits.startsWith(plan.countryCode)) continue;
    const local = digits.slice(plan.countryCode.length);
    if (!plan.localPattern.test(local)) return err({ kind: 'invalidFormat' });
    return ok(`+${plan.countryCode}${stripTrunkZero(local)}`);
  }

  if (international) return err({ kind: 'unknownCountry' });

  for (const plan of PLANS) {
    if (!plan.localPattern.test(digits)) continue;
    return ok(`+${plan.countryCode}${stripTrunkZero(digits)}`);
  }
  return err({ kind: 'invalidFormat' });
}

/** Boolean convenience over {@link validateMerchantPhone} for quick guards. */
export function isValidMerchantPhone(raw: string): boolean {
  return validateMerchantPhone(raw).ok;
}

function stripTrunkZero(local: string): string {
  return local.startsWith('0') ? local.slice(1) : local;
}
