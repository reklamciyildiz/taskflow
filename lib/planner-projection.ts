import type { Json } from '@/lib/database.types';
import type { RecurrenceFrequency, WorkOccurrenceState, WorkSource } from '@/lib/scheduling-domain';

export interface PlannerProjectionItem {
  /** Stable projection identity. No second task/work record is created. */
  id: string;
  source: WorkSource;
  scheduleId: string;
  scheduleDate: string;
  occurrenceDate: string;
  effectiveDate: string;
  state: WorkOccurrenceState;
  completedAt: string | null;
  organizationId: string;
  teamId: string;
  taskId: string;
  taskTitle: string;
  checklistItemId: string | null;
  checklistItemText: string | null;
  projectId: string | null;
  projectName: string | null;
  assigneeId: string | null;
  scheduleTime: string | null;
  timeZone: string | null;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceInterval: number;
  recurrenceWeekdays: number[];
  endsOn: string | null;
  reminderRules: Json[];
  /** Computed only for the current actionable recurring row; no pending rows are materialized. */
  missedCount: number;
}

export interface PlannerTodayProjection {
  date: string;
  overdue: PlannerProjectionItem[];
  today: PlannerProjectionItem[];
  completedToday: PlannerProjectionItem[];
}

export interface PlannerUpcomingGroup {
  date: string;
  items: PlannerProjectionItem[];
}

export interface PlannerUpcomingProjection {
  startDate: string;
  endDate: string;
  groups: PlannerUpcomingGroup[];
}

export function buildPlannerUpcomingProjection(
  items: PlannerProjectionItem[],
  startDate: string,
  endDate: string,
): PlannerUpcomingProjection {
  const groups = new Map<string, PlannerProjectionItem[]>();
  for (const item of items) {
    if (item.effectiveDate < startDate || item.effectiveDate > endDate) continue;
    if (item.state === 'skipped') continue;
    const current = groups.get(item.effectiveDate) ?? [];
    current.push(item);
    groups.set(item.effectiveDate, current);
  }
  return {
    startDate,
    endDate,
    groups: [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, groupItems]) => ({ date, items: groupItems.sort(comparePlannerItems) })),
  };
}

function calendarDateInTimeZone(value: string, timeZone: string): string | null {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function comparePlannerItems(left: PlannerProjectionItem, right: PlannerProjectionItem): number {
  return left.effectiveDate.localeCompare(right.effectiveDate)
    || (left.scheduleTime ?? '99:99').localeCompare(right.scheduleTime ?? '99:99')
    || left.taskTitle.localeCompare(right.taskTitle)
    || left.id.localeCompare(right.id);
}

/** Pure grouping for the Today read model. Calendar dates stay date-only. */
export function buildPlannerTodayProjection(
  items: PlannerProjectionItem[],
  date: string,
  timeZone: string,
): PlannerTodayProjection {
  const result: PlannerTodayProjection = {
    date,
    overdue: [],
    today: [],
    completedToday: [],
  };

  for (const item of items) {
    if (item.state === 'skipped') continue;
    if (item.state === 'completed') {
      const completedDate = item.completedAt
        ? calendarDateInTimeZone(item.completedAt, timeZone)
        : item.effectiveDate;
      if (completedDate === date) result.completedToday.push(item);
      continue;
    }
    if (item.effectiveDate < date) result.overdue.push(item);
    else if (item.effectiveDate === date) result.today.push(item);
  }

  result.overdue.sort(comparePlannerItems);
  result.today.sort(comparePlannerItems);
  result.completedToday.sort((left, right) => {
    const leftTime = left.completedAt ? Date.parse(left.completedAt) : 0;
    const rightTime = right.completedAt ? Date.parse(right.completedAt) : 0;
    return rightTime - leftTime || comparePlannerItems(left, right);
  });
  return result;
}
