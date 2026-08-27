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

/**
 * Grace window before expiry, in whole days (configurable): the renewal
 * reminder banner shows while a usable subscription is this close to its
 * expiry (PRD §4.4). Tune here to retune every consumer globally.
 */
export const GRACE_DAYS = 2;

const MS_PER_DAY = 86_400_000;

/**
 * Whole days remaining until `expiresAtIso`; null when missing/unparseable.
 *
 * Rounds with CEIL toward expiry (36h left → 2) deliberately: the reminder
 * must appear early rather than late — generous to the merchant (PRD §4.5).
 * Negative results mean the timestamp is already in the past.
 */
export function daysUntilExpiry(
  expiresAtIso: string | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiresAtIso) return null;
  const expiryMs = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiryMs)) return null;
  return Math.ceil((expiryMs - now.getTime()) / MS_PER_DAY);
}

/**
 * True only while the subscription is still usable (active/trial) AND within
 * GRACE_DAYS of expiry — the grace-banner window.
 */
export function isInGraceWindow(
  state: SubscriptionState,
  expiresAtIso: string | undefined,
  now: Date = new Date(),
): boolean {
  if (state !== 'active' && state !== 'trial') return false;
  const days = daysUntilExpiry(expiresAtIso, now);
  return days !== null && days >= 0 && days <= GRACE_DAYS;
}
