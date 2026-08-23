import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/services/idb/db';

import { dexieAuthStorage } from './storageAdapter';

const KEY = 'sb-demo-project-auth-token';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('dexieAuthStorage (GoTrue adapter)', () => {
  it('stores, reads, and removes the session JSON', async () => {
    await expect(dexieAuthStorage.getItem(KEY)).resolves.toBeNull();

    const sessionJson = JSON.stringify({
      access_token: 'a.b.c',
      refresh_token: 'r',
      user: { id: 'u1' },
    });
    await dexieAuthStorage.setItem(KEY, sessionJson);
    await expect(dexieAuthStorage.getItem(KEY)).resolves.toBe(sessionJson);

    await dexieAuthStorage.removeItem(KEY);
    await expect(dexieAuthStorage.getItem(KEY)).resolves.toBeNull();
  });
});
