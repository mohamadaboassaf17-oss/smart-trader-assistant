/**
 * Profiles service.
 *
 * The profile row lives in IndexedDB (id = user id) and syncs to the
 * `profiles` table via the standard sync queue. Onboarding is the only
 * creator: it stamps the 7-day trial (PRD §4.3) client-side; the DB
 * trigger re-asserts it server-side on first insert.
 */

import { v4 as uuidv4 } from 'uuid';

import { db } from '@/services/idb/db';
import { createRepository } from '@/services/idb/repository';
import { LOCAL_CURRENCY_BY_COUNTRY, type CountryCode } from '@/types/currency';
import { tryAsync, type Result } from '@/types/result';
import { trialExpiryIso } from '@/utils/subscription';

import type { Profile } from '@/types/domain';

export const profileRepo = createRepository(db.profile);

/** Local profile for a user id, or undefined when onboarding not done. */
export function getLocalProfile(userId: string): Promise<Profile | undefined> {
  return profileRepo.get(userId);
}

/**
 * Create (or complete) the local profile during onboarding and queue its
 * remote upsert. Returns the stored row.
 */
export async function createProfile(
  userId: string,
  country: CountryCode,
  now: Date = new Date(),
): Promise<Profile> {
  const nowIso = now.toISOString();
  const existing = await getLocalProfile(userId);
  const row: Profile = {
    id: userId ?? uuidv4(),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    country,
    localCurrency: LOCAL_CURRENCY_BY_COUNTRY[country],
    subscriptionStatus: existing?.subscriptionStatus ?? 'trial',
    subscriptionExpiresAt: existing?.subscriptionExpiresAt ?? trialExpiryIso(now),
  };
  await profileRepo.put(row);
  return row;
}

/** Result-wrapped variant for UI call sites. */
export function saveProfile(row: Profile): Promise<Result<void, Error>> {
  return tryAsync(() => profileRepo.put(row).then(() => undefined));
}
