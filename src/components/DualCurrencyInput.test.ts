import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import DualCurrencyInput from '@/components/DualCurrencyInput.vue';

function mountDual(props: Record<string, unknown> = {}) {
  return mount(DualCurrencyInput, {
    props: {
      localCurrencyLabel: 'ل.ل',
      usdCents: null,
      localCents: null,
      ...props,
    },
    global: { plugins: [i18n] },
  });
}

describe('<DualCurrencyInput>', () => {
  it('renders both currency fields with Arabic labels', () => {
    const wrapper = mountDual();
    const labels = wrapper.findAll('label span');
    expect(labels[0]?.text()).toBe('كاش بالدولار');
    expect(labels[1]?.text()).toContain('كاش بالـل.ل');
  });

  it('emits update:usdCents from the USD field', async () => {
    const wrapper = mountDual();
    const inputs = wrapper.findAll('input');
    await inputs[0]!.setValue('25.00');
    expect(wrapper.emitted('update:usdCents')?.at(-1)).toEqual([2_500]);
  });

  it('emits update:localCents from the local field', async () => {
    const wrapper = mountDual();
    const inputs = wrapper.findAll('input');
    await inputs[1]!.setValue('2500'); // 2500 ل.ل typed → 250_000 local cents
    expect(wrapper.emitted('update:localCents')?.at(-1)).toEqual([250_000]);
  });

  it('disables both fields when disabled', () => {
    const wrapper = mountDual({ disabled: true });
    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('disabled')).toBeDefined();
    }
  });
});
