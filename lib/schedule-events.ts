import type { WorkSchedule, WorkSource } from '@/lib/scheduling-domain';

export const SCHEDULE_CHANGED_EVENT = 'axiom:schedule-changed';
export const OCCURRENCE_CHANGED_EVENT = 'axiom:occurrence-changed';
export const PLANNER_CAPTURE_TIME_EVENT = 'axiom:planner-capture-time';

export interface ScheduleChangedDetail {
  source: WorkSource;
  schedule: WorkSchedule | null;
}

export interface OccurrenceChangedDetail {
  scheduleId: string;
  occurrenceDate: string;
}

export interface PlannerCaptureTimeDetail {
  date: string;
  time: string;
}

export function dispatchScheduleChanged(source: WorkSource, schedule: WorkSchedule | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT, { detail: { source, schedule } }));
}

export function dispatchOccurrenceChanged(scheduleId: string, occurrenceDate: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OCCURRENCE_CHANGED_EVENT, {
    detail: { scheduleId, occurrenceDate },
  }));
}

export function dispatchPlannerCaptureTime(date: string, time: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PlannerCaptureTimeDetail>(PLANNER_CAPTURE_TIME_EVENT, {
    detail: { date, time },
  }));
}
