import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import AppToaster from '@/components/AppToaster.vue';
import { clearToasts, pushToast, useToast } from '@/composables/useToast';

describe('useToast queue', () => {
  afterEach(() => {
    clearToasts();
    vi.useRealTimers();
  });

  it('pushToast appends and auto-dismisses after the duration', async () => {
    vi.useFakeTimers();
    pushToast('success', 'تم', 50);
    const { toasts } = useToast();
    expect(toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(60);
    await flushPromises();
    expect(toasts.value).toHaveLength(0);
  });

  it('dismiss removes a specific toast only', () => {
    pushToast('info', 'one');
    pushToast('info', 'two');
    const { toasts, dismiss } = useToast();
    expect(toasts.value).toHaveLength(2);
    const firstId = toasts.value[0]?.id;
    if (firstId !== undefined) dismiss(firstId);
    expect(toasts.value.map((t) => t.message)).toEqual(['two']);
  });
});

describe('<AppToaster>', () => {
  afterEach(() => clearToasts());

  it('renders toasts with role=status and dismiss button works', async () => {
    const wrapper = mount(AppToaster);
    pushToast('error', 'حدث خطأ');
    await nextTick(); // Vue batches DOM updates

    const region = wrapper.get('[role="status"]');
    expect(region.attributes('aria-live')).toBe('polite');
    expect(wrapper.text()).toContain('حدث خطأ');

    await wrapper.get('.toast__close').trigger('click');
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(0);
  });
});
