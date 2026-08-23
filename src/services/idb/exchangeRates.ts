/**
 * Daily exchange-rate persistence (PRD §6.1).
 *
 * The trader enters one local-per-USD rate per business day; it is captured
 * with each transaction and never recomputed at display time.
 */

import { tryAsync, type Result } from '@/types/result';

import { db } from './db';

import type { ExchangeRateEntry } from '@/types/domain';

/** `YYYY-MM-DD` in local time. */
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getRateForDate(date: string): Promise<ExchangeRateEntry | undefined> {
  return db.exchangeRates.get(date);
}

export async function setRateForDate(date: string, rate: number): Promise<void> {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError(`setRateForDate: invalid rate (${rate})`);
  }
  await db.exchangeRates.put({ date, rate, updatedAt: new Date().toISOString() });
}

/** Most recently updated entry regardless of date — used as a sane default. */
export async function getLatestRate(): Promise<ExchangeRateEntry | undefined> {
  return db.exchangeRates.orderBy('updatedAt').last();
}

/**
 * Result-wrapped variant for UI call sites that surface errors as toasts.
 */
export function saveRate(date: string, rate: number): Promise<Result<void, Error>> {
  return tryAsync(() => setRateForDate(date, rate));
}
