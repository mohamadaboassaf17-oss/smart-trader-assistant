import { beforeEach, describe, expect, it } from 'vitest';

import { db } from './db';
import { getLatestRate, getRateForDate, saveRate, setRateForDate, todayIso } from './exchangeRates';

describe('exchangeRates service', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('persists one rate per date and reads it back', async () => {
    await setRateForDate('2026-08-21', 89_500);
    const entry = await getRateForDate('2026-08-21');
    expect(entry?.rate).toBe(89_500);
    expect(entry?.date).toBe('2026-08-21');
  });

  it('rejects invalid rates', async () => {
    await expect(setRateForDate('2026-08-21', 0)).rejects.toThrow(RangeError);
    await expect(setRateForDate('2026-08-21', -5)).rejects.toThrow(RangeError);
    await expect(saveRate('2026-08-21', Number.NaN)).resolves.toMatchObject({ ok: false });
  });

  it('getLatestRate returns the most recently updated entry', async () => {
    await setRateForDate('2026-08-20', 88_000);
    await new Promise((r) => setTimeout(r, 5));
    await setRateForDate('2026-08-21', 90_000);
    const latest = await getLatestRate();
    expect(latest?.rate).toBe(90_000);
  });

  it('todayIso returns a YYYY-MM-DD string', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
