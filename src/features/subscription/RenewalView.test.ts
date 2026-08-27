import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/app/i18n';
import RenewalView from '@/features/subscription/RenewalView.vue';

import type { Profile } from '@/types/domain';

/**
 * `useAuth` is a module singleton with no public profile setter, so the
 * auth composable is mocked and the profile is injected per test. The view
 * reads `auth.state.profile` once per computed evaluation; no reactivity is
 * needed across a single mount.
 */
const mocks = vi.hoisted(() => ({
  profile: { value: null as Profile | null },
  signOut: vi.fn(async (): Promise<void> => {}),
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    state: {
      ready: true,
      loading: false,
      user: { id: 'user-1' },
      profile: mocks.profile.value,
    },
    ensureReady: async (): Promise<void> => {},
    signOut: mocks.signOut,
  }),
}));

function profileRow(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    country: 'LB',
    localCurrency: 'LBP',
    subscriptionStatus: 'trial',
    ...overrides,
  };
}

async function mountRenewal(): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(RenewalView, { global: { plugins: [i18n] } });
  await flushPromises();
  return wrapper;
}

const daysFromNowIso = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

beforeEach(() => {
  mocks.profile.value = null;
  mocks.signOut.mockClear();
});

describe('<RenewalView>', () => {
  it('renders the title, plan price and both contact CTAs', async () => {
    const wrapper = await mountRenewal();

    expect(wrapper.find('[data-testid="renewal-title"]').text()).toBe('تجديد الاشتراك');
    expect(wrapper.find('[data-testid="renewal-status"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cta-whatsapp"]').attributes('href')).toMatch(
      /^https:\/\/wa\.me\//,
    );
    expect(wrapper.find('[data-testid="cta-email"]').attributes('href')).toMatch(/^mailto:/);
  });

  it('shows remaining days for an in-trial account', async () => {
    mocks.profile.value = profileRow({
      subscriptionExpiresAt: daysFromNowIso(3),
    });

    const wrapper = await mountRenewal();

    expect(wrapper.find('[data-testid="renewal-status"]').text()).toContain('اشتراك تجريبي');
    expect(wrapper.find('[data-testid="renewal-status"]').text()).toContain('يتبقى 3 يوماً');
  });

  it('shows the active-until date for a renewed account', async () => {
    mocks.profile.value = profileRow({
      subscriptionStatus: 'active',
      subscriptionExpiresAt: daysFromNowIso(30),
    });

    const wrapper = await mountRenewal();

    expect(wrapper.find('[data-testid="renewal-status"]').text()).toContain('مفعّل حتى');
  });

  it('shows the expired message for a lapsed trial', async () => {
    mocks.profile.value = profileRow({
      subscriptionExpiresAt: daysFromNowIso(-1),
    });

    const wrapper = await mountRenewal();

    expect(wrapper.find('[data-testid="renewal-status"]').text()).toContain('انتهت صلاحية اشتراكك');
  });

  it('prefills the WhatsApp CTA with the renewal message and hardens it', async () => {
    const wrapper = await mountRenewal();

    const cta = wrapper.find('[data-testid="cta-whatsapp"]');
    expect(cta.attributes('href')).toContain(
      encodeURIComponent('تجديد اشتراك المساعد الذكي للتاجر'),
    );
    expect(cta.attributes('target')).toBe('_blank');
    expect(cta.attributes('rel')).toContain('noopener');
  });

  it('targets the support inbox with an encoded subject on the email CTA', async () => {
    const wrapper = await mountRenewal();

    const href = wrapper.find('[data-testid="cta-email"]').attributes('href') ?? '';
    expect(href.startsWith('mailto:')).toBe(true);
    expect(href).toContain(encodeURIComponent('تجديد اشتراك المساعد الذكي للتاجر'));
  });

  it('offers sign-out which delegates to the auth composable', async () => {
    const wrapper = await mountRenewal();

    const button = wrapper.find<HTMLButtonElement>('[data-testid="signout"]');
    expect(button.exists()).toBe(true);

    await button.trigger('click');
    await flushPromises();

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});
