/**
 * Supabase singleton.
 *
 * Returns `null` until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set
 * (provisioning is an M1/M3 task). Every consumer must handle the null case
 * so the app stays fully usable offline-only until then.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { dexieAuthStorage } from './storageAdapter';

let client: SupabaseClient | null = null;
let warned = false;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    if (!warned) {
      console.warn(
        '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — running offline-only',
      );
      warned = true;
    }
    return null;
  }
  client = createClient(url, anonKey, {
    auth: {
      // JWT + refresh token live in IndexedDB via Dexie (offline cold start).
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: dexieAuthStorage,
    },
  });
  return client;
}

/** Test hook. */
export function resetSupabase(): void {
  client = null;
  warned = false;
}
