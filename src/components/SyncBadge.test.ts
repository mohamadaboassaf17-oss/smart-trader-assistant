import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { i18n } from '@/app/i18n';
import SyncBadge from '@/components/SyncBadge.vue';
import { offlineSyncState, stopOfflineSync } from '@/composables/useOfflineSync';

import type { VueWrapper } from '@vue/test-utils';

function mountBadge(): VueWrapper {
  return mount(SyncBadge, { global: { plugins: [i18n] } });
}

describe('<SyncBadge>', () => {
  it('shows ✅ with the "saved" aria label when the queue is empty', () => {
    offlineSyncState.pendingCount.value = 0;
    offlineSyncState.deadCount.value = 0;
    const wrapper = mountBadge();
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('تم الحفظ');
    expect(wrapper.text()).toContain('✅');
  });

  it('shows ⏳ with the "pending" aria label while items are queued', () => {
    offlineSyncState.pendingCount.value = 2;
    offlineSyncState.deadCount.value = 0;
    const wrapper = mountBadge();
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('في انتظار الإنترنت');
    expect(wrapper.text()).toContain('⏳');
    wrapper.unmount();
  });

  it('shows ❌ when items dead-lettered', () => {
    offlineSyncState.pendingCount.value = 1;
    offlineSyncState.deadCount.value = 1;
    const wrapper = mountBadge();
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('فشل الحفظ');
    expect(wrapper.text()).toContain('❌');
    wrapper.unmount();
    stopOfflineSync();
  });
});
