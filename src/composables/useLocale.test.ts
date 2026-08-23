import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { i18n, type LocaleCode } from '@/app/i18n';
import { useLocale } from '@/composables/useLocale';

/**
 * Host drives useLocale INSIDE setup so useI18n() has an active
 * component instance; `next` lets tests trigger locale changes.
 */
const TestHost = {
  props: { next: { type: String, default: '' } },
  setup(props: { next: string }) {
    const api = useLocale();
    if (props.next) api.set(props.next as LocaleCode);
    return { api };
  },
  template: '<div>{{ api.locale }} / {{ api.isRtl }}</div>',
};

describe('useLocale', () => {
  it('defaults to ar with RTL true', () => {
    const wrapper = mount(TestHost, { global: { plugins: [i18n] } });
    expect(wrapper.text()).toBe('ar / true');
  });

  it('rejects unsupported locales without touching the document', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const wrapper = mount(TestHost, { props: { next: 'fr' }, global: { plugins: [i18n] } });
      expect(wrapper.text()).toBe('ar / true');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('keeps <html lang/dir> in sync with the locale', () => {
    mount(TestHost, { props: { next: 'ar' }, global: { plugins: [i18n] } });
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });
});
