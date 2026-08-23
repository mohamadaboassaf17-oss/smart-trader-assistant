/**
 * useLocale — the locale contract from AGENTS.md.
 *
 * Single-locale MVP (`ar`, RTL). Exposes the reactive locale plus a `set`
 * action so M3+ (onboarding, future `en` pack) can switch without touching
 * components. Keeps `<html lang/dir>` in sync with logical CSS expectations.
 */

import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  applyDocumentLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type LocaleCode,
} from '@/app/i18n';

export function useLocale() {
  const { locale, t } = useI18n();

  const current = computed<LocaleCode>(() =>
    (SUPPORTED_LOCALES as readonly string[]).includes(locale.value)
      ? (locale.value as LocaleCode)
      : DEFAULT_LOCALE,
  );

  const isRtl = computed(() => current.value === 'ar');

  function set(next: LocaleCode): void {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(next)) {
      console.warn(`[locale] unsupported locale "${next}" — keeping ${current.value}`);
      return;
    }
    locale.value = next;
    applyDocumentLocale(next);
  }

  return { locale: current, isRtl, set, t };
}
