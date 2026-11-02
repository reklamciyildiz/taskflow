import { isCalendarDate } from '@/lib/scheduling-domain';

export type PlannerDropTarget = { date: string; time: string };

/** Pure 15-minute snapping for the 24-hour calendar grid. */
export function snapPlannerTime(
  pointerY: number,
  gridTop: number,
  pxPerHour: number,
  grabOffsetMinutes: number,
  durationMinutes: number,
): string {
  const raw = ((pointerY - gridTop) / pxPerHour) * 60 - grabOffsetMinutes;
  const lastStart = Math.max(0, 1440 - Math.min(1440, Math.max(5, durationMinutes)));
  const minute = Math.max(0, Math.min(lastStart, Math.round(raw / 15) * 15));
  const snapped = Math.floor(minute / 15) * 15;
  return `${String(Math.floor(snapped / 60)).padStart(2, '0')}:${String(snapped % 60).padStart(2, '0')}`;
}

export function isValidPlannerMove(
  target: PlannerDropTarget | null,
  today: string,
  original: PlannerDropTarget,
): target is PlannerDropTarget {
  return Boolean(target && isCalendarDate(target.date) &&
    target.date >= today && /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(target.time) &&
    (target.date !== original.date || target.time !== original.time.slice(0, 5)));
}

/** User-facing copy: recurring exceptions currently store the *date*, not individual times. */
export function plannerDragSupported(isRecurring: boolean, scheduleTime: string | null): boolean {
  return !isRecurring && Boolean(scheduleTime);
}
