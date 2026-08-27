import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flushOfflineQueue } from '@/composables/useOfflineSync';
import { db } from '@/services/idb/db';
import { getRecord } from '@/services/idb/session';
import { pullChanges, pushQueue } from '@/services/sync/flush';

import {
  evaluateAfterSync,
  EXPIRED_CONFIRMED_KEY,
  initSubscriptionWatch,
  isLockExemptRoute,
  resetSubscriptionState,
  useSubscription,
} from './useSubscription';

import type { FlushSummary } from '@/services/sync/flush';
import type { Profile } from '@/types/domain';

// Controllable auth singleton stand-in: useSubscription only touches
// state.user / state.profile / refreshProfile().
const authMock = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as unknown,
  refreshCalls: 0,
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    state: {
      ready: true,
      loading: false,
      get user() {
        return authMock.user;
      },
      get profile() {
        return authMock.profile;
      },
    },
    refreshProfile: async () => {
      authMock.refreshCalls += 1;
    },
  }),
}));

// Override the global offline-only client stub so flushOfflineQueue actually
// runs its push+pull cycle against the mocked sync layer below.
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => ({}) }));

// Wrap the sync engine's two entry points; every other export stays real.
vi.mock('@/services/sync/flush', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pushQueue: vi.fn(),
  pullChanges: vi.fn(),
}));

function okSummary(overrides: Partial<FlushSummary> = {}): { ok: true; value: FlushSummary } {
  return { ok: true, value: { pushed: 0, failed: 0, dead: 0, pulled: 0, ...overrides } };
}

function fail(): { ok: false; error: Error } {
  return { ok: false, error: new Error('network down') };
}

const nowIso = new Date().toISOString();

function profileRow(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    createdAt: nowIso,
    updatedAt: nowIso,
    country: 'LB',
    localCurrency: 'LBP',
    subscriptionStatus: 'trial',
    subscriptionExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    ...overrides,
  };
}

describe('useSubscription', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    resetSubscriptionState();
    authMock.user = null;
    authMock.profile = null;
    authMock.refreshCalls = 0;
    vi.mocked(pushQueue).mockReset();
    vi.mocked(pullChanges).mockReset();
  });

  describe('initSubscriptionWatch', () => {
    it('defaults to unlocked without a flag or profile', async () => {
      await initSubscriptionWatch();
      const { state } = useSubscription();
      expect(state.locked).toBe(false);
      expect(state.graceBannerVisible).toBe(false);
      expect(state.expiresAt).toBeNull();
    });

    it('a persisted confirmed-expiry flag keeps the lock across restarts', async () => {
      const expired = profileRow({
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: undefined,
      });
      await db.profile.put(expired);
      await db.session.put({
        key: EXPIRED_CONFIRMED_KEY,
        value: 'true',
        updatedAt: nowIso,
      });
      authMock.profile = expired;

      await initSubscriptionWatch();

      expect(useSubscription().state.locked).toBe(true);
    });

    it('is idempotent — later auth changes alone do not flip it', async () => {
      await initSubscriptionWatch();
      authMock.profile = profileRow({ subscriptionStatus: 'expired' });
      await initSubscriptionWatch();
      expect(useSubscription().state.locked).toBe(false);
    });
  });

  describe('evaluateAfterSync', () => {
    it('expired profile after a successful cycle → locked + flag persisted + profile refreshed', async () => {
      authMock.user = { id: 'u1' };
      await db.profile.put(profileRow({ subscriptionStatus: 'expired' }));

      await evaluateAfterSync();

      const { state } = useSubscription();
      expect(state.locked).toBe(true);
      expect(await getRecord(EXPIRED_CONFIRMED_KEY)).toBe('true');
      expect(authMock.refreshCalls).toBe(1);
      expect(state.graceBannerVisible).toBe(false);
    });

    it('renewed (active) profile → unlocked + flag cleared', async () => {
      authMock.user = { id: 'u1' };
      await db.session.put({ key: EXPIRED_CONFIRMED_KEY, value: 'true', updatedAt: nowIso });
      await db.profile.put(profileRow({ subscriptionStatus: 'active' }));

      await evaluateAfterSync();

      const { state } = useSubscription();
      expect(state.locked).toBe(false);
      expect(await getRecord(EXPIRED_CONFIRMED_KEY)).toBeNull();
      expect(authMock.refreshCalls).toBe(1);
    });

    it('grace window is wired: trial a day from expiry shows the banner', async () => {
      authMock.user = { id: 'u1' };
      await db.profile.put(
        profileRow({ subscriptionExpiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      );

      await evaluateAfterSync();

      const { state } = useSubscription();
      expect(state.locked).toBe(false);
      expect(state.graceBannerVisible).toBe(true);
      expect(state.expiresAt).not.toBeNull();
    });

    it('no signed-in user → no-op, flag untouched', async () => {
      await db.session.put({ key: EXPIRED_CONFIRMED_KEY, value: 'true', updatedAt: nowIso });

      await evaluateAfterSync();

      expect(await getRecord(EXPIRED_CONFIRMED_KEY)).toBe('true');
      expect(authMock.refreshCalls).toBe(0);
    });
  });

  describe('flushOfflineQueue integration (hook placement)', () => {
    it('success path runs the evaluation and can lock (PRD §4.4–§4.5)', async () => {
      vi.mocked(pushQueue).mockResolvedValue(okSummary());
      vi.mocked(pullChanges).mockResolvedValue(okSummary({ pulled: 1 }));
      authMock.user = { id: 'u1' };
      await db.profile.put(profileRow({ subscriptionStatus: 'expired' }));

      await flushOfflineQueue();
      await flushPromises();

      expect(useSubscription().state.locked).toBe(true);
      expect(await getRecord(EXPIRED_CONFIRMED_KEY)).toBe('true');
    });

    it('failure path never touches the lock or the flag (offline stays usable)', async () => {
      vi.mocked(pushQueue).mockResolvedValue(okSummary());
      vi.mocked(pullChanges).mockResolvedValue(fail());
      authMock.user = { id: 'u1' };
      await db.profile.put(profileRow({ subscriptionStatus: 'expired' }));

      await flushOfflineQueue();

      expect(useSubscription().state.locked).toBe(false);
      expect(await getRecord(EXPIRED_CONFIRMED_KEY)).toBeNull();
      expect(authMock.refreshCalls).toBe(0);
    });
  });

  describe('isLockExemptRoute', () => {
    it('exempts subscription/auth/onboarding only', () => {
      expect(isLockExemptRoute('subscription')).toBe(true);
      expect(isLockExemptRoute('auth')).toBe(true);
      expect(isLockExemptRoute('onboarding')).toBe(true);
      expect(isLockExemptRoute('dashboard')).toBe(false);
      expect(isLockExemptRoute(undefined)).toBe(false);
    });
  });
});
