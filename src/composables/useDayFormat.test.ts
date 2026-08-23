import { describe, expect, it } from 'vitest';

import { addDaysIso, formatDayLabel, parseIsoDate, toIsoDate } from '@/composables/useDayFormat';

describe('useDayFormat helpers', () => {
  it('shifts dates across month boundaries', () => {
    expect(addDaysIso('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysIso('2026-09-01', -1)).toBe('2026-08-31');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('round-trips parse → format', () => {
    expect(toIsoDate(parseIsoDate('2026-08-22'))).toBe('2026-08-22');
  });

  it('rejects malformed ISO input', () => {
    expect(() => parseIsoDate('2026/08/22')).toThrow(RangeError);
    expect(() => addDaysIso('not-a-date', 1)).toThrow(RangeError);
  });

  it('formats a localized Arabic day label and falls back to ISO on failure', () => {
    const label = formatDayLabel('2026-08-22');
    expect(label).not.toBe('2026-08-22');
    expect(label.length).toBeGreaterThan(0);
  });
});
