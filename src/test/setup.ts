/**
 * Vitest global setup.
 * - fake-indexeddb: jsdom has no IndexedDB; this polyfill backs Dexie in tests.
 * - Pin the Supabase client module to its offline-only shape (`getSupabase()`
 *   → null). Vite env loading would otherwise hand tests a real client once
 *   `.env` is provisioned, which trips the sync queue's auth-ownership gate
 *   in every suite that enqueues without signing in (see src/test/supabaseModule.ts).
 */

import 'fake-indexeddb/auto';

import { vi } from 'vitest';

vi.mock('@/services/supabase/client', async () => {
  const mod = await import('@/test/supabaseModule');
  return mod;
});
