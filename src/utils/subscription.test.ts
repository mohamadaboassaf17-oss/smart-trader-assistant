import { describe, expect, it } from 'vitest';

import {
  daysUntilExpiry,
  GRACE_DAYS,
  hasFeatureAccess,
  isInGraceWindow,
  subscriptionState,
  trialExpiryIso,
} from './subscription';

import type { Profile } from '@/types/domain';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    country: 'LB',
    localCurrency: 'LBP',
    subscriptionStatus: 'trial',
    subscriptionExpiresAt: '2999-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('trialExpiryIso', () => {
  it('adds exactly 7 days', () => {
    const now = new Date('2026-08-21T10:00:00.000Z');
    expect(trialExpiryIso(now)).toBe('2026-08-28T10:00:00.000Z');
  });
});

describe('subscriptionState', () => {
  const now = new Date('2026-08-21');

  it('no profile → none', () => {
    expect(subscriptionState(null, now)).toBe('none');
  });

  it('active wins regardless of expiry', () => {
    expect(
      subscriptionState(
        makeProfile({ subscriptionStatus: 'active', subscriptionExpiresAt: '2000-01-01' }),
        now,
      ),
    ).toBe('active');
    expect(
      subscriptionState(
        makeProfile({ subscriptionStatus: 'active', subscriptionExpiresAt: undefined }),
        now,
      ),
    ).toBe('active');
  });

  it('valid future trial → trial', () => {
    expect(subscriptionState(makeProfile(), now)).toBe('trial');
  });

  it('past-due trial → expired', () => {
    expect(
      subscriptionState(makeProfile({ subscriptionExpiresAt: '2020-01-01T00:00:00.000Z' }), now),
    ).toBe('expired');
  });

  it('trial without expiry is expired', () => {
    expect(subscriptionState(makeProfile({ subscriptionExpiresAt: undefined }), now)).toBe(
      'expired',
    );
  });

  it('expired status stays expired', () => {
    expect(
      subscriptionState(
        makeProfile({ subscriptionStatus: 'expired', subscriptionExpiresAt: '2999-01-01' }),
        now,
      ),
    ).toBe('expired');
  });
});

describe('hasFeatureAccess', () => {
  it('grants access for active and valid trial, denies expired/missing', () => {
    expect(hasFeatureAccess(makeProfile())).toBe(true);
    expect(hasFeatureAccess(makeProfile({ subscriptionStatus: 'active' }))).toBe(true);
    expect(
      hasFeatureAccess(makeProfile({ subscriptionExpiresAt: '2020-01-01T00:00:00.000Z' })),
    ).toBe(false);
    expect(hasFeatureAccess(null)).toBe(false);
  });
});

describe('GRACE_DAYS', () => {
  it('is the documented configurable value of 2 (PRD §4.4)', () => {
    expect(GRACE_DAYS).toBe(2);
  });
});

describe('daysUntilExpiry', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('missing value → null', () => {
    expect(daysUntilExpiry(undefined, now)).toBeNull();
    expect(daysUntilExpiry('', now)).toBeNull();
  });

  it('unparseable value → null', () => {
    expect(daysUntilExpiry('not-a-date', now)).toBeNull();
  });

  it('36h remaining → ceil to 2 (banner shows early, generous to merchant)', () => {
    expect(daysUntilExpiry('2026-08-27T00:00:00.000Z', now)).toBe(2);
  });

  it('exactly 24h → 1', () => {
    expect(daysUntilExpiry('2026-08-26T12:00:00.000Z', now)).toBe(1);
  });

  it('exact expiry instant → 0', () => {
    expect(daysUntilExpiry('2026-08-25T12:00:00.000Z', now)).toBe(0);
  });

  it('already past → negative (36h overdue → -1)', () => {
    expect(daysUntilExpiry('2026-08-24T00:00:00.000Z', now)).toBe(-1);
  });
});

describe('isInGraceWindow', () => {
  const now = new Date('2026-08-23T00:00:00.000Z');

  it('trial expiring today (exact 0 days) → true', () => {
    expect(isInGraceWindow('trial', '2026-08-23T00:00:00.000Z', now)).toBe(true);
  });

  it('trial exactly GRACE_DAYS out → true', () => {
    expect(isInGraceWindow('trial', '2026-08-25T00:00:00.000Z', now)).toBe(true);
  });

  it('trial GRACE_DAYS + 1 out → false', () => {
    expect(isInGraceWindow('trial', '2026-08-26T00:00:00.000Z', now)).toBe(false);
  });

  it('active within the window → true', () => {
    expect(isInGraceWindow('active', '2026-08-24T10:00:00.000Z', now)).toBe(true);
  });

  it('expired state never warns even with a near date', () => {
    expect(isInGraceWindow('expired', '2026-08-24T00:00:00.000Z', now)).toBe(false);
    expect(isInGraceWindow('none', '2026-08-24T00:00:00.000Z', now)).toBe(false);
  });

  it('missing/unparseable expiry → false', () => {
    expect(isInGraceWindow('trial', undefined, now)).toBe(false);
    expect(isInGraceWindow('trial', 'garbage', now)).toBe(false);
  });

  it('composes with subscriptionState for the real flow', () => {
    const expiringSoon = makeProfile({
      subscriptionExpiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    });
    const comfortable = makeProfile({
      subscriptionExpiresAt: new Date(now.getTime() + 5 * 86_400_000).toISOString(),
    });
    expect(
      isInGraceWindow(
        subscriptionState(expiringSoon, now),
        expiringSoon.subscriptionExpiresAt,
        now,
      ),
    ).toBe(true);
    expect(
      isInGraceWindow(subscriptionState(comfortable, now), comfortable.subscriptionExpiresAt, now),
    ).toBe(false);
  });
});
