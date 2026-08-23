import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/services/idb/db';

import { resetAuthState, ensureAuthReady, useAuth } from './useAuth';

describe('useAuth (offline-only mode, no supabase configured)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    resetAuthState();
    // No VITE_SUPABASE_* in test env → getSupabase() returns null → the
    // composable must still resolve to a signed-out ready state.
  });

  it('ensureReady resolves once and reports signed-out', async () => {
    await Promise.all([ensureAuthReady(), ensureAuthReady()]); // idempotent
    const { state } = useAuth();
    expect(state.ready).toBe(true);
    expect(state.user).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('completeOnboarding refuses without a user', async () => {
    await ensureAuthReady();
    const { completeOnboarding } = useAuth();
    const result = await completeOnboarding('LB');
    expect(result.ok).toBe(false);
  });
});
