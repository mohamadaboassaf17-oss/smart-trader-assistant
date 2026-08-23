import { beforeEach, describe, expect, it } from 'vitest';

import { db } from './db';
import {
  clearTokens,
  getAccessToken,
  getRecord,
  removeRecord,
  setRecord,
  setTokens,
} from './session';

describe('session KV store', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('get/set/remove round-trips arbitrary keys (supabase adapter surface)', async () => {
    expect(await getRecord('sb-test-auth-token')).toBeNull();
    await setRecord('sb-test-auth-token', '{"access_token":"a"}');
    expect(await getRecord('sb-test-auth-token')).toBe('{"access_token":"a"}');
    await removeRecord('sb-test-auth-token');
    expect(await getRecord('sb-test-auth-token')).toBeNull();
  });

  it('stores and reads both manual tokens', async () => {
    await setTokens('access-xyz', 'refresh-abc');
    expect(await getAccessToken()).toBe('access-xyz');
    expect(await getRecord('supabase_refresh_token')).toBe('refresh-abc');
  });

  it('overwrites previous values on re-set', async () => {
    await setTokens('a1', 'r1');
    await setTokens('a2', 'r2');
    expect(await getAccessToken()).toBe('a2');
  });

  it('clears manual tokens', async () => {
    await setTokens('a', 'r');
    await clearTokens();
    expect(await getAccessToken()).toBeUndefined();
    expect(await getRecord('supabase_refresh_token')).toBeNull();
  });
});
