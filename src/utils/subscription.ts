/**
 * Subscription state helpers (PRD §4.3–§4.5).
 *
 * Pure functions — no network, no storage. The UI lock (M6) and the router
 * guard both read these; the server remains the source of truth after sync.
 */

import type { Profile } from '@/types/domain';

export const TRIAL_DAYS = 7;

/** Trial expiry timestamp for a brand-new profile, ISO 8601. */
export function trialExpiryIso(now: Date = new Date()): string {
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + TRIAL_DAYS);
  return expiry.toISOString();
}

export type SubscriptionState = 'active' | 'trial' | 'expired' | 'none';

/**
 * Resolve the effective subscription state.
 * - `active` wins regardless of expiry (founder renewed in Supabase).
 * - `trial` is valid only while `subscriptionExpiresAt` is in the future.
 */
export function subscriptionState(
  profile: Pick<Profile, 'subscriptionStatus' | 'subscriptionExpiresAt'> | null,
  now: Date = new Date(),
): SubscriptionState {
  if (!profile) return 'none';
  switch (profile.subscriptionStatus) {
    case 'active':
      return 'active';
    case 'trial': {
      if (!profile.subscriptionExpiresAt) return 'expired';
      return new Date(profile.subscriptionExpiresAt).getTime() > now.getTime()
        ? 'trial'
        : 'expired';
    }
    default:
      return 'expired';
  }
}

/** Convenience predicate for guards/UI locking. */
export function hasFeatureAccess(profile: Profile | null): boolean {
  const state = subscriptionState(profile);
  return state === 'active' || state === 'trial';
}
