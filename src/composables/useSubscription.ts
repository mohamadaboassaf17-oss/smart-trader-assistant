/**
 * useSubscription — M6 lock + grace banner state (PRD §4.3–§4.5).
 *
 * Singleton reactive state, mirroring useAuth/useOfflineSync siblings.
 *
 * The LOCK may engage ONLY after a successful ONLINE sync cycle pulled an
 * expired profile from the server: `evaluateAfterSync()` is called
 * exclusively from flushOfflineQueue's success branch (PRD §4.5 — an offline
 * device without a confirming check keeps full access). The confirmation is
 * persisted in the session KV store so a locked device stays locked across
 * cold starts until a fresh sync proves otherwise.
 *
 * Wiring (chosen over hooking inside useAuth.ensureAuthReady to avoid a
 * useAuth ↔ useSubscription import cycle):
 *   - router.beforeEach awaits `initSubscriptionWatch()` right after
 *     ensureAuthReady (idempotent) so refs are populated before every
 *     guard decision;
 *   - useOfflineSync's success path calls `evaluateAfterSync()`.
 */
import { readonly, ref } from 'vue';

import { useAuth } from '@/composables/useAuth';
import { getRecord, removeRecord, setRecord } from '@/services/idb/session';
import { getLocalProfile } from '@/services/profiles/profiles';
import { isInGraceWindow, subscriptionState } from '@/utils/subscription';

import type { Profile } from '@/types/domain';

/** Session KV key marking an ONLINE-confirmed expiry (PRD §4.5). */
export const EXPIRED_CONFIRMED_KEY = 'subscription.expiredConfirmedOnline';

const state = {
  /** Router lock: every feature route redirects to /subscription. */
  locked: ref(false),
  /** ≤ GRACE_DAYS before expiry while still usable → banner in AppShell. */
  graceBannerVisible: ref(false),
  /** Raw expiry timestamp of the current profile (null when absent). */
  expiresAt: ref<string | null>(null),
};

let initialized = false;

function applyProfile(
  profile: Pick<Profile, 'subscriptionStatus' | 'subscriptionExpiresAt'> | null,
): void {
  const iso = profile?.subscriptionExpiresAt ?? null;
  const st = subscriptionState(profile);
  state.expiresAt.value = iso;
  state.graceBannerVisible.value = isInGraceWindow(st, iso ?? undefined);
}

/**
 * Read the hydrated auth profile + persisted KV flag into refs. Idempotent:
 * runs once per session; later updates arrive via evaluateAfterSync.
 */
export async function initSubscriptionWatch(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const { state: authState } = useAuth();
    applyProfile(authState.profile);
    // A previously confirmed-online expiry keeps locking across restarts.
    state.locked.value = (await getRecord(EXPIRED_CONFIRMED_KEY)) === 'true';
  } catch (error) {
    console.error('[subscription] init failed', error);
  }
}

/**
 * Re-evaluate after a CONFIRMED-ONLINE sync cycle (flush success branch):
 * pull has just merged fresh rows (incl. the profile) into IndexedDB.
 * Never called on failure/offline paths — see useOfflineSync.
 */
export async function evaluateAfterSync(): Promise<void> {
  const auth = useAuth();
  const userId = auth.state.user?.id;
  if (!userId) return;
  let profile: Profile | undefined;
  try {
    // Re-read locally: pull already merged the server's row into Dexie;
    // auth state.profile is stale until refreshProfile() below.
    profile = await getLocalProfile(userId);
  } catch (error) {
    console.error('[subscription] post-sync profile read failed', error);
    return; // never lock on a local read failure
  }
  applyProfile(profile ?? null);
  if (subscriptionState(profile ?? null) === 'expired') {
    await setRecord(EXPIRED_CONFIRMED_KEY, 'true');
    state.locked.value = true;
  } else {
    await removeRecord(EXPIRED_CONFIRMED_KEY);
    state.locked.value = false;
  }
  await auth.refreshProfile();
}

/** Route names the lock never touches (shared by guard + AppShell watcher). */
export function isLockExemptRoute(name: unknown): boolean {
  return name === 'subscription' || name === 'auth' || name === 'onboarding';
}

/** Test/dev reset. */
export function resetSubscriptionState(): void {
  initialized = false;
  state.locked.value = false;
  state.graceBannerVisible.value = false;
  state.expiresAt.value = null;
}

export interface SubscriptionApi {
  readonly state: {
    readonly locked: boolean;
    readonly graceBannerVisible: boolean;
    readonly expiresAt: string | null;
  };
}

export function useSubscription(): SubscriptionApi {
  return { state: readonly(state) as unknown as SubscriptionApi['state'] };
}
