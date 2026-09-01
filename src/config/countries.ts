/**
 * Country allowlist (M9).
 * Controls which onboarding options are offered.
 * Defaults to LB,SY,IQ; override via VITE_ENABLED_COUNTRIES="LB,SY".
 */

import { COUNTRIES, type CountryCode } from '@/types/currency';

function parseEnabled(raw: string | undefined): CountryCode[] {
  if (!raw || raw.trim() === '') return [...COUNTRIES];
  const parts = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as CountryCode[];
  const valid = parts.filter((c) => (COUNTRIES as readonly string[]).includes(c));
  return valid.length > 0 ? valid : [...COUNTRIES];
}

export const ENABLED_COUNTRIES: CountryCode[] = parseEnabled(
  import.meta.env.VITE_ENABLED_COUNTRIES as string | undefined,
);

export function isCountryEnabled(code: CountryCode): boolean {
  return ENABLED_COUNTRIES.includes(code);
}
