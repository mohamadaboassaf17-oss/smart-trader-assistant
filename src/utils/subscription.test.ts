import { describe, expect, it } from 'vitest';

import { hasFeatureAccess, subscriptionState, trialExpiryIso } from './subscription';

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
