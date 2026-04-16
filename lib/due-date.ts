import { format } from 'date-fns';

/** Strict `YYYY-MM-DD` (date-only; no time / timezone suffix). */
export const DATE_ONLY_YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Serialize a calendar due date for the API / DB.
 * Uses the user's local calendar day (not UTC), so Google Calendar all-day matches the picker.
 */
export function formatDueDateYmdLocal(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse stored `due_date`. Date-only values use local calendar noon (DST-safe, stable sorting).
 * Legacy ISO datetimes still parse as instants.
 */
export function parseDueDateFromApi(value: string | null | undefined): Date | undefined {
  if (value == null || value === '') return undefined;
  const s = String(value).trim();
  if (DATE_ONLY_YMD.test(s)) {
    const [y, m, d] = s.split('-').map((x) => Number(x));
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? undefined : t;
}

/** `<input type="date">` value → local calendar Date at noon (never use `new Date('yyyy-mm-dd')`). */
export function parseYmdDateInput(ymd: string): Date | undefined {
  const s = ymd.trim();
  if (!DATE_ONLY_YMD.test(s)) return undefined;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
