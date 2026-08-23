/**
 * Session persistence (PRD §4.2).
 *
 * A generic key/value store in IndexedDB. Supabase's GoTrue client is wired
 * with a storage adapter over this table (see `storageAdapter.ts`), so the
 * JWT + refresh token survive reloads and cold offline starts without
 * localStorage.
 */

import { db } from './db';

/** Generic KV — used by the supabase storage adapter and manual tokens. */
export async function getRecord(key: string): Promise<string | null> {
  const rec = await db.session.get(key);
  return rec?.value ?? null;
}

export async function setRecord(key: string, value: string): Promise<void> {
  await db.session.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function removeRecord(key: string): Promise<void> {
  await db.session.delete(key);
}

// ── Manual token helpers (kept for diagnostics / future refresh flows) ──────

const SESSION_KEYS = {
  accessToken: 'supabase_access_token',
  refreshToken: 'supabase_refresh_token',
} as const;

export async function getAccessToken(): Promise<string | undefined> {
  return (await getRecord(SESSION_KEYS.accessToken)) ?? undefined;
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await db.transaction('rw', db.session, () =>
    Promise.all([
      setRecord(SESSION_KEYS.accessToken, accessToken),
      setRecord(SESSION_KEYS.refreshToken, refreshToken),
    ]),
  );
}

export async function clearTokens(): Promise<void> {
  await db.session.bulkDelete([SESSION_KEYS.accessToken, SESSION_KEYS.refreshToken]);
}
