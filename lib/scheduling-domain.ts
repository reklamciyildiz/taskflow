import type { Json } from '@/lib/database.types';

export type WorkSource =
  | { sourceType: 'action'; taskId: string }
  | { sourceType: 'checklist_item'; taskId: string; checklistItemId: string };

export type WorkScheduleType = 'one_off' | 'recurring';
export type RecurrenceFrequency = 'daily' | 'weekly';
export type WorkOccurrenceState = 'pending' | 'completed' | 'skipped';

export interface WorkSchedule {
  id: string;
  organizationId: string;
  teamId: string;
  source: WorkSource;
  scheduleType: WorkScheduleType;
  /** Strict `YYYY-MM-DD`; this is a calendar date, never a UTC instant. */
  scheduleDate: string;
  /** Local wall-clock time (`HH:mm` or `HH:mm:ss`) interpreted in `timeZone`. */
  scheduleTime: string | null;
  /** IANA time zone, required exactly when scheduleTime is present. */
  timeZone: string | null;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceInterval: number;
  /** ISO weekdays: Monday=1 ... Sunday=7. Used only for weekly recurrence. */
  recurrenceWeekdays: number[];
  endsOn: string | null;
  reminderRules: Json[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOccurrence {
  id: string;
  scheduleId: string;
  occurrenceDate: string;
  effectiveDate: string;
  state: WorkOccurrenceState;
  completedAt: string | null;
  rescheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkScheduleInput {
  source: WorkSource;
  scheduleType: WorkScheduleType;
  scheduleDate: string;
  scheduleTime?: string | null;
  timeZone?: string | null;
  recurrenceFrequency?: RecurrenceFrequency | null;
  recurrenceInterval?: number;
  recurrenceWeekdays?: number[];
  endsOn?: string | null;
  reminderRules?: Json[];
}

export type WorkSchedulePatch = Partial<Omit<WorkScheduleInput, 'source'>>;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;

export class SchedulingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulingValidationError';
  }
}

export function isCalendarDate(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function assertCalendarDate(value: string, field = 'date'): void {
  if (!isCalendarDate(value)) {
    throw new SchedulingValidationError(`${field} must be a valid YYYY-MM-DD calendar date`);
  }
}

export function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeSource(source: WorkSource): WorkSource {
  const taskId = source.taskId.trim();
  if (!taskId) throw new SchedulingValidationError('taskId is required');
  if (source.sourceType === 'action') return { sourceType: 'action', taskId };
  const checklistItemId = source.checklistItemId.trim();
  if (!checklistItemId) {
    throw new SchedulingValidationError('checklistItemId is required for checklist schedules');
  }
  return { sourceType: 'checklist_item', taskId, checklistItemId };
}

export function normalizeWorkScheduleInput(input: WorkScheduleInput): WorkScheduleInput {
  const source = normalizeSource(input.source);
  assertCalendarDate(input.scheduleDate, 'scheduleDate');

  const scheduleTime = input.scheduleTime?.trim() || null;
  const timeZone = input.timeZone?.trim() || null;
  if ((scheduleTime === null) !== (timeZone === null)) {
    throw new SchedulingValidationError('scheduleTime and timeZone must be provided together');
  }
  if (scheduleTime && !LOCAL_TIME.test(scheduleTime)) {
    throw new SchedulingValidationError('scheduleTime must be a valid local HH:mm[:ss] value');
  }
  if (timeZone && !isIanaTimeZone(timeZone)) {
    throw new SchedulingValidationError('timeZone must be a valid IANA time zone');
  }

  const recurrenceInterval = input.recurrenceInterval ?? 1;
  if (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1 || recurrenceInterval > 32767) {
    throw new SchedulingValidationError('recurrenceInterval must be a positive small integer');
  }

  const recurrenceWeekdays = [...new Set(input.recurrenceWeekdays ?? [])].sort((a, b) => a - b);
  if (recurrenceWeekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new SchedulingValidationError('recurrenceWeekdays must contain ISO weekdays 1 through 7');
  }

  const endsOn = input.endsOn?.trim() || null;
  if (endsOn) {
    assertCalendarDate(endsOn, 'endsOn');
    if (endsOn < input.scheduleDate) {
      throw new SchedulingValidationError('endsOn cannot be before scheduleDate');
    }
  }

  const recurrenceFrequency = input.recurrenceFrequency ?? null;
  if (input.scheduleType === 'one_off') {
    if (recurrenceFrequency !== null || recurrenceInterval !== 1 || recurrenceWeekdays.length > 0 || endsOn) {
      throw new SchedulingValidationError('one-off schedules cannot contain recurrence fields');
    }
  } else {
    if (recurrenceFrequency !== 'daily' && recurrenceFrequency !== 'weekly') {
      throw new SchedulingValidationError('recurring schedules require daily or weekly frequency');
    }
    if (recurrenceFrequency === 'daily' && recurrenceWeekdays.length > 0) {
      throw new SchedulingValidationError('daily recurrence cannot contain weekdays');
    }
    if (recurrenceFrequency === 'weekly' && recurrenceWeekdays.length === 0) {
      throw new SchedulingValidationError('weekly recurrence requires at least one weekday');
    }
  }

  const reminderRules = input.reminderRules ?? [];
  if (!Array.isArray(reminderRules)) {
    throw new SchedulingValidationError('reminderRules must be an array');
  }

  return {
    source,
    scheduleType: input.scheduleType,
    scheduleDate: input.scheduleDate,
    scheduleTime,
    timeZone,
    recurrenceFrequency,
    recurrenceInterval,
    recurrenceWeekdays,
    endsOn,
    reminderRules,
  };
}

export function calendarDayNumber(ymd: string): number {
  assertCalendarDate(ymd);
  const [year, month, day] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function isoWeekday(ymd: string): number {
  const day = new Date(calendarDayNumber(ymd) * 86_400_000).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Pure recurrence matcher. It never parses a calendar date as a local/UTC timestamp. */
export function scheduleMatchesDate(
  schedule: Pick<
    WorkSchedule,
    | 'scheduleType'
    | 'scheduleDate'
    | 'recurrenceFrequency'
    | 'recurrenceInterval'
    | 'recurrenceWeekdays'
    | 'endsOn'
  >,
  candidateDate: string,
): boolean {
  assertCalendarDate(candidateDate, 'candidateDate');
  if (candidateDate < schedule.scheduleDate) return false;
  if (schedule.endsOn && candidateDate > schedule.endsOn) return false;
  if (schedule.scheduleType === 'one_off') return candidateDate === schedule.scheduleDate;

  const difference = calendarDayNumber(candidateDate) - calendarDayNumber(schedule.scheduleDate);
  if (schedule.recurrenceFrequency === 'daily') {
    return difference % schedule.recurrenceInterval === 0;
  }
  if (schedule.recurrenceFrequency === 'weekly') {
    const weekIndex = Math.floor(difference / 7);
    return weekIndex % schedule.recurrenceInterval === 0
      && schedule.recurrenceWeekdays.includes(isoWeekday(candidateDate));
  }
  return false;
}

export function addCalendarDays(date: string, days: number): string {
  const next = new Date((calendarDayNumber(date) + days) * 86_400_000);
  return next.toISOString().slice(0, 10);
}

export function calendarDatesInRange(startDate: string, endDate: string): string[] {
  assertCalendarDate(startDate, 'startDate');
  assertCalendarDate(endDate, 'endDate');
  if (endDate < startDate) throw new SchedulingValidationError('endDate cannot be before startDate');
  const start = calendarDayNumber(startDate);
  const end = calendarDayNumber(endDate);
  const result: string[] = [];
  for (let day = start; day <= end; day += 1) {
    result.push(new Date(day * 86_400_000).toISOString().slice(0, 10));
  }
  return result;
}

export function implicitOccurrenceState(
  schedule: WorkSchedule,
  occurrenceDate: string,
  persisted: WorkOccurrence | null,
): WorkOccurrenceState | null {
  if (schedule.scheduleType !== 'recurring' || !scheduleMatchesDate(schedule, occurrenceDate)) {
    return null;
  }
  return persisted?.state ?? 'pending';
}

export function sourceKey(source: WorkSource): string {
  return source.sourceType === 'action'
    ? `action:${source.taskId}`
    : `checklist_item:${source.taskId}:${source.checklistItemId}`;
}

export function workScheduleFromRow(row: any): WorkSchedule {
  const checklistItemId = typeof row.checklist_item_id === 'string' && row.checklist_item_id
    ? row.checklist_item_id
    : null;
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    teamId: String(row.team_id),
    source: checklistItemId
      ? { sourceType: 'checklist_item', taskId: String(row.task_id), checklistItemId }
      : { sourceType: 'action', taskId: String(row.task_id) },
    scheduleType: row.schedule_type as WorkScheduleType,
    scheduleDate: String(row.schedule_date),
    scheduleTime: row.schedule_time ? String(row.schedule_time) : null,
    timeZone: row.time_zone ? String(row.time_zone) : null,
    recurrenceFrequency: row.recurrence_frequency as RecurrenceFrequency | null,
    recurrenceInterval: Number(row.recurrence_interval),
    recurrenceWeekdays: Array.isArray(row.recurrence_weekdays)
      ? row.recurrence_weekdays.map(Number)
      : [],
    endsOn: row.ends_on ? String(row.ends_on) : null,
    reminderRules: Array.isArray(row.reminder_rules) ? row.reminder_rules : [],
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function workOccurrenceFromRow(row: any): WorkOccurrence {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    occurrenceDate: String(row.occurrence_date),
    effectiveDate: String(row.effective_date),
    state: row.state as WorkOccurrenceState,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    rescheduledAt: row.rescheduled_at ? String(row.rescheduled_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
