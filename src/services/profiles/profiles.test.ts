import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/services/idb/db';
import { subscriptionState } from '@/utils/subscription';

import { createProfile, getLocalProfile, profileRepo } from './profiles';

import type { CountryCode } from '@/types/currency';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('createProfile (trial upsert)', () => {
  it('creates a trial profile with 7-day expiry and derived currency', async () => {
    const row = await createProfile('u-1', 'LB', new Date('2026-08-21T10:00:00.000Z'));
    expect(row.id).toBe('u-1');
    expect(row.country).toBe<CountryCode>('LB');
    expect(row.localCurrency).toBe('LBP');
    expect(row.subscriptionStatus).toBe('trial');
    expect(row.subscriptionExpiresAt).toBe('2026-08-28T10:00:00.000Z');
    expect(subscriptionState(row, new Date('2026-08-25'))).toBe('trial');
  });

  it('maps SY → SYP', async () => {
    const row = await createProfile('u-sy', 'SY');
    expect(row.localCurrency).toBe('SYP');
  });

  it('is idempotent — re-running keeps original createdAt + trial stamp', async () => {
    const first = await createProfile('u-2', 'SY', new Date('2026-08-01T00:00:00.000Z'));
    const again = await createProfile('u-2', 'SY', new Date('2026-08-21T00:00:00.000Z'));
    expect(again.createdAt).toBe(first.createdAt);
    expect(again.subscriptionExpiresAt).toBe(first.subscriptionExpiresAt);
    expect(await getLocalProfile('u-2')).toEqual(again);
  });

  it('persists into the IDB profile store (readable by repo)', async () => {
    await createProfile('u-3', 'LB');
    expect((await profileRepo.count()) === 1).toBe(true);
  });
});
