/**
 * useAuth — the single auth entry point (PRD §4).
 *
 * Singleton reactive state; `ensureReady()` is awaited by the router guard
 * before any navigation decision. Profile reads come from IndexedDB first
 * (offline-first); the sync queue keeps the remote `profiles` row fresh.
 *
 * States after ensureReady():
 *   user=null                    → signed out (guard → /auth)
 *   user && !profile             → needs onboarding (guard → /onboarding)
 *   user && profile              → app usable (subject to subscription, M6)
 */

import { readonly, ref } from 'vue';

import { useOfflineSync } from '@/composables/useOfflineSync';
import { createProfile, getLocalProfile } from '@/services/profiles/profiles';
import {
  restoreSession,
  signInWithGoogle,
  signInWithOtp,
  signInWithPassword,
  signOut as signOutSvc,
  signUpWithPassword,
  verifyOtp,
  type AuthErrorKey,
} from '@/services/supabase/auth';
import { getSupabase } from '@/services/supabase/client';

import type { CountryCode } from '@/types/currency';
import type { Profile } from '@/types/domain';
import type { Result } from '@/types/result';
import type { User } from '@supabase/supabase-js';

const state = {
  ready: ref(false),
  loading: ref(false),
  user: ref<User | null>(null),
  profile: ref<Profile | null>(null),
};

let readyPromise: Promise<void> | null = null;

async function hydrateUser(user: User | null): Promise<void> {
  state.user.value = user;
  if (!user) {
    state.profile.value = null;
    return;
  }
  const row = await getLocalProfile(user.id);
  state.profile.value = row ?? null;
}

/** Restore session + local profile; safe to call many times. */
export function ensureAuthReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const user = await restoreSession();
      await hydrateUser(user);
      const client = getSupabase();
      client?.auth.onAuthStateChange((_event, session) => {
        void hydrateUser(session?.user ?? null);
      });
      state.ready.value = true;
    })();
  }
  return readyPromise;
}

/** Test/dev reset. */
export function resetAuthState(): void {
  readyPromise = null;
  state.ready.value = false;
  state.loading.value = false;
  state.user.value = null;
  state.profile.value = null;
}

type AuthSvcResult = Promise<
  { ok: true; value: { user: User } } | { ok: false; error: AuthErrorKey }
>;

export interface AuthApi {
  readonly state: {
    readonly ready: boolean;
    readonly loading: boolean;
    readonly user: User | null;
    readonly profile: Profile | null;
  };
  ensureReady: () => Promise<void>;
  /** Complete onboarding: create the trial profile locally + queue upsert. */
  completeOnboarding: (country: CountryCode) => Promise<Result<Profile, Error>>;
  signInEmail: (email: string, password: string) => Promise<Result<User, AuthErrorKey>>;
  signUpEmail: (email: string, password: string) => Promise<Result<User, AuthErrorKey>>;
  sendOtp: (phone: string) => Promise<Result<null, AuthErrorKey>>;
  confirmOtp: (phone: string, code: string) => Promise<Result<User, AuthErrorKey>>;
  google: () => Promise<Result<null, AuthErrorKey>>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthApi {
  async function runAuth(fn: () => AuthSvcResult): Promise<Result<User, AuthErrorKey>> {
    state.loading.value = true;
    try {
      const result = await fn();
      if (!result.ok) return result;
      await hydrateUser(result.value.user);
      return { ok: true, value: result.value.user };
    } finally {
      state.loading.value = false;
    }
  }

  async function completeOnboarding(country: CountryCode): Promise<Result<Profile, Error>> {
    const user = state.user.value;
    if (!user)
      return { ok: false, error: new Error('completeOnboarding requires a signed-in user') };
    try {
      const row = await createProfile(user.id, country);
      state.profile.value = row;
      // Remote push rides the standard optimistic path (queue + flush).
      const result = await useOfflineSync().save('profile', row);
      if (!result.ok) console.warn('[auth] profile queued offline:', result.error.message);
      return { ok: true, value: row };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  async function signOut(): Promise<void> {
    await signOutSvc();
    await hydrateUser(null);
  }

  return {
    state: readonly(state) as unknown as AuthApi['state'],
    ensureReady: ensureAuthReady,
    completeOnboarding,
    signInEmail: (email, password) =>
      runAuth(() => signInWithPassword(email, password) as ReturnType<() => AuthSvcResult>),
    signUpEmail: (email, password) =>
      runAuth(() => signUpWithPassword(email, password) as ReturnType<() => AuthSvcResult>),
    sendOtp: (phone) => signInWithOtp(phone),
    confirmOtp: (phone, code) =>
      runAuth(() => verifyOtp(phone, code) as ReturnType<() => AuthSvcResult>),
    google: () => signInWithGoogle(),
    signOut,
  };
}
