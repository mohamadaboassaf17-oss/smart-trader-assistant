/**
 * Day helpers shared by dated features (M4).
 *
 * Storage format is ISO `YYYY-MM-DD` (AGENTS.md dates rule). Display labels
 * come from `Intl` with the app's locked `ar` locale — month/weekday names
 * are CLDR data, never hardcoded copy.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse `YYYY-MM-DD` to a Date anchored at noon (DST-safe arithmetic). */
export function parseIsoDate(iso: string): Date {
  if (!ISO_DATE_RE.test(iso)) {
    throw new RangeError(`parseIsoDate: expected YYYY-MM-DD, got "${iso}"`);
  }
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Date(year, month - 1, day, 12);
}

/** Format a `Date` back to `YYYY-MM-DD` in local time. */
export function toIsoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Shift an ISO `YYYY-MM-DD` date by whole calendar days. */
export function addDaysIso(iso: string, days: number): string {
  const shifted = parseIsoDate(iso);
  shifted.setDate(shifted.getDate() + days);
  return toIsoDate(shifted);
}

/**
 * Human day label, e.g. "الأحد ٢٣ آب". Falls back to the raw ISO string on
 * formatter failure (logged, never silent).
 */
export function formatDayLabel(iso: string, locale = 'ar'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(parseIsoDate(iso));
  } catch (e) {
    console.error('[day-format] label failed', {
      iso,
      message: e instanceof Error ? e.message : String(e),
    });
    return iso;
  }
}
