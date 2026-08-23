import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import NumberInput from '@/components/NumberInput.vue';

function mountInput(props: Record<string, unknown> = {}) {
  return mount(NumberInput, { props: { ...props } });
}

describe('<NumberInput> (cents mode)', () => {
  it('emits integer cents for a typed amount', async () => {
    const wrapper = mountInput();
    const input = wrapper.get('input');
    await input.setValue('12.34');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1_234]);
  });

  it('emits null when valid text turns invalid or empty', async () => {
    const wrapper = mountInput();
    const input = wrapper.get('input');
    await input.setValue('42');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4_200]);
    await input.setValue('abc');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    await input.setValue('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
  });

  it('marks invalid text with aria-invalid', async () => {
    const wrapper = mountInput();
    const input = wrapper.get('input');
    await input.setValue('abc');
    expect(input.attributes('aria-invalid')).toBe('true');
    await input.setValue('42');
    expect(input.attributes('aria-invalid')).toBe('false');
  });

  it('normalizes display on blur ("12.5" → "12.5")', async () => {
    const wrapper = mountInput();
    const input = wrapper.get('input');
    await input.setValue('12.5');
    await input.trigger('blur');
    expect((input.element as HTMLInputElement).value).toBe('12.5');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1_250]);
  });
});

describe('<NumberInput> (plain mode)', () => {
  it('emits raw numbers (e.g. exchange rate)', async () => {
    const wrapper = mountInput({ mode: 'plain' });
    const input = wrapper.get('input');
    await input.setValue('89500');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([89_500]);
  });

  it('rejects non-numeric plain input', async () => {
    const wrapper = mountInput({ mode: 'plain' });
    const input = wrapper.get('input');
    await input.setValue('89500');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([89_500]);
    await input.setValue('895x0');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    expect(input.attributes('aria-invalid')).toBe('true');
  });
});
