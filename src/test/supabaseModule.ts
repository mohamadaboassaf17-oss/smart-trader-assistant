/**
 * Deterministic Supabase module for unit tests.
 *
 * Vitest loads `.env` like Vite does, so once VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY were provisioned, `getSupabase()` started returning
 * a real client inside tests. That silently changed the sync queue's
 * ownership gate (protected entities require an authenticated session) and
 * broke every suite that enqueues without signing in.
 *
 * This module restores the contract those suites were written against: the
 * offline-only build where no remote project is configured (`getSupabase()`
 * returns null). It is installed as a module mock from `src/test/setup.ts`;
 * production code is untouched and real users can still never enqueue
 * protected rows without a session.
 */

export function getSupabase(): null {
  return null;
}

/** Kept for signature parity with the real module; a no-op here. */
export function resetSupabase(): void {
  // Intentionally empty — nothing is cached in the test double.
}
