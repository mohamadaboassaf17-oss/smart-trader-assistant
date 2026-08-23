/**
 * Vue I18n bootstrap.
 *
 * Single-locale MVP (ar) — `en` will be added in a later milestone.
 * Locale is locked to 'ar' and the document `dir`/`lang` attributes are
 * synced in `useLocale()` so RTL is always correct.
 */

import { createI18n } from 'vue-i18n';

import ar from '@/locales/ar.json';

export const SUPPORTED_LOCALES = ['ar'] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: LocaleCode = 'ar';

export type MessageSchema = typeof ar;

export const i18n = createI18n<[MessageSchema], LocaleCode>({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { ar },
});

/** Apply the locale's direction to the document root. */
export function applyDocumentLocale(locale: LocaleCode): void {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', dir);
  }
}
