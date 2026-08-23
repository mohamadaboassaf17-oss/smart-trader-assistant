/**
 * Dexie-backed storage adapter for supabase-js auth.
 *
 * GoTrue persists its session JSON under `sb-<ref>-auth-token`. Routing it
 * through this adapter keeps tokens in IndexedDB (offline cold start) and
 * out of localStorage entirely.
 */

import { getRecord, removeRecord, setRecord } from '@/services/idb/session';

import type { SupportedStorage } from '@supabase/supabase-js';

export const dexieAuthStorage: SupportedStorage = {
  getItem: (key: string) => getRecord(key),
  setItem: (key: string, value: string) => setRecord(key, value).then(() => undefined),
  removeItem: (key: string) => removeRecord(key).then(() => undefined),
};
