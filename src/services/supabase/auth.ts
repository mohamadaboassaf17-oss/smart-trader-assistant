/**
 * Auth service — thin, Result-returning wrapper over supabase-js GoTrue.
 *
 * All three PRD §4.1 methods live here (Google OAuth / email+password /
 * phone+OTP). Errors are mapped to i18n keys (`authErrors.*`) so the UI
 * never renders raw exception text.
 */

import { err, ok, type Result } from '@/types/result';

import { getSupabase } from './client';

import type { SupabaseClient, User } from '@supabase/supabase-js';

/** i18n keys under `authErrors.*` in ar.json. */
export type AuthErrorKey =
  | 'invalidCredentials'
  | 'emailInUse'
  | 'weakPassword'
  | 'invalidOtp'
  | 'network'
  | 'notConfigured'
  | 'unknown';

const SUPABASE_MESSAGE_MAP: ReadonlyArray<[RegExp, AuthErrorKey]> = [
  [/invalid login credentials/i, 'invalidCredentials'],
  [/email not confirmed/i, 'invalidCredentials'],
  [/user already registered/i, 'emailInUse'],
  [/password.*at least/i, 'weakPassword'],
  [/invalid|expired|otp/i, 'invalidOtp'],
  [/failed to fetch|network|fetch failed/i, 'network'],
];

export function mapAuthError(error: unknown): AuthErrorKey {
  if (error instanceof Error) {
    for (const [pattern, key] of SUPABASE_MESSAGE_MAP) {
      if (pattern.test(error.message)) return key;
    }
  }
  return 'unknown';
}

function requireClient(): Result<SupabaseClient, AuthErrorKey> {
  const client = getSupabase();
  return client ? ok(client) : err('notConfigured');
}

export interface AuthSuccess {
  user: User;
}

async function toResult(
  fn: () => Promise<{ data: { user: User | null }; error: { message: string } | null }>,
): Promise<Result<AuthSuccess, AuthErrorKey>> {
  try {
    const { data, error } = await fn();
    if (error) return err(mapAuthError(new Error(error.message)));
    if (!data.user) return err('unknown');
    return ok({ user: data.user });
  } catch (e) {
    return err(mapAuthError(e));
  }
}

export function signInWithPassword(
  email: string,
  password: string,
): Promise<Result<AuthSuccess, AuthErrorKey>> {
  const client = requireClient();
  if (!client.ok) return Promise.resolve(client);
  return toResult(() => client.value.auth.signInWithPassword({ email, password }));
}

export function signUpWithPassword(
  email: string,
  password: string,
): Promise<Result<AuthSuccess, AuthErrorKey>> {
  const client = requireClient();
  if (!client.ok) return Promise.resolve(client);
  return toResult(() => client.value.auth.signUp({ email, password }));
}

export async function signInWithOtp(phone: string): Promise<Result<null, AuthErrorKey>> {
  const client = requireClient();
  if (!client.ok) return client;
  try {
    const { error } = await client.value.auth.signInWithOtp({ phone });
    if (error) return err(mapAuthError(new Error(error.message)));
    return ok(null);
  } catch (e) {
    return err(mapAuthError(e));
  }
}

export function verifyOtp(
  phone: string,
  token: string,
): Promise<Result<AuthSuccess, AuthErrorKey>> {
  const client = requireClient();
  if (!client.ok) return Promise.resolve(client);
  return toResult(() => client.value.auth.verifyOtp({ phone, token, type: 'sms' }));
}

/** Redirects the browser to Google; result arrives via detectSessionInUrl. */
export async function signInWithGoogle(): Promise<Result<null, AuthErrorKey>> {
  const client = requireClient();
  if (!client.ok) return client;
  try {
    const { error } = await client.value.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) return err(mapAuthError(new Error(error.message)));
    return ok(null);
  } catch (e) {
    return err(mapAuthError(e));
  }
}

export async function signOut(): Promise<Result<null, AuthErrorKey>> {
  const client = requireClient();
  if (!client.ok) return client;
  try {
    const { error } = await client.value.auth.signOut();
    if (error) return err(mapAuthError(new Error(error.message)));
    return ok(null);
  } catch (e) {
    return err(mapAuthError(e));
  }
}

/**
 * Restore the persisted session from IndexedDB storage. Works offline:
 * GoTrue reads our Dexie adapter without touching the network unless a
 * refresh is strictly required.
 */
export async function restoreSession(): Promise<User | null> {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user ?? null;
  } catch {
    // Expired token + offline → treat as signed out locally; the next
    // online sync cycle can re-restore once refresh succeeds.
    console.warn('[auth] session restore failed (offline or invalid)');
    return null;
  }
}
