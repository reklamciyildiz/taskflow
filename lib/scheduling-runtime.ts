import type { Json } from '@/lib/database.types';
import { addCalendarDays, SchedulingValidationError, type WorkSchedule } from '@/lib/scheduling-domain';
import type { ReminderPresetId } from '@/lib/reminder-presets';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_UTC_MIDNIGHT = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.\d{1,9})?(?:Z|[+-]00:00)$/i;

export type AbsoluteReminderRule = {
  type: 'absolute';
  at: string;
  preset?: 'when_due';
};

export type LegacyScheduleFields = {
  scheduleDate: string;
  scheduleTime: string | null;
  timeZone: string | null;
};

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** Calendar date at an instant in an IANA timezone; never derives date-only work via UTC. */
export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  const local = zonedParts(date, timeZone);
  return `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

export function legacyDueValueToSchedule(
  raw: string,
  actorTimeZone: string,
): LegacyScheduleFields {
  const value = raw.trim();
  if (DATE_ONLY.test(value)) {
    return { scheduleDate: value, scheduleTime: null, timeZone: null };
  }
  if (LEGACY_UTC_MIDNIGHT.test(value)) {
    return { scheduleDate: value.slice(0, 10), scheduleTime: null, timeZone: null };
  }

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new SchedulingValidationError('Invalid due date');
  const local = zonedParts(instant, actorTimeZone);
  const scheduleDate = `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;

  // The existing DueFlowPicker deliberately uses local noon as its date-only sentinel.
  if (local.hour === 12 && local.minute === 0 && local.second === 0) {
    return { scheduleDate, scheduleTime: null, timeZone: null };
  }
  return {
    scheduleDate,
    scheduleTime: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:${String(local.second).padStart(2, '0')}`,
    timeZone: actorTimeZone,
  };
}

function localWallClockToIso(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetAsUtc;

  // Resolve the IANA offset for this wall clock. Repeating handles DST offset boundaries.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = zonedParts(new Date(guess), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const delta = targetAsUtc - observedAsUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess).toISOString();
}

/** Resolve a schedule to its due instant for reminder-policy comparisons. */
export function scheduleDueInstantIso(
  schedule: Pick<LegacyScheduleFields, 'scheduleDate' | 'scheduleTime' | 'timeZone'>,
  dateOnlyTimeZone: string,
): string {
  return localWallClockToIso(
    schedule.scheduleDate,
    schedule.scheduleTime ?? '12:00:00',
    schedule.timeZone ?? dateOnlyTimeZone,
  );
}

/** Compatibility value returned to the existing date picker; storage remains relational. */
export function scheduleToLegacyDueValue(schedule: WorkSchedule): string {
  if (!schedule.scheduleTime || !schedule.timeZone) return schedule.scheduleDate;
  return localWallClockToIso(schedule.scheduleDate, schedule.scheduleTime, schedule.timeZone);
}

export function reminderRulesFromInstants(
  values: string[] | null | undefined,
  dueInstant?: string | null,
): Json[] {
  if (!Array.isArray(values)) return [];
  const normalizedDue = dueInstant ? new Date(dueInstant).toISOString() : null;
  const seen = new Set<string>();
  const rules: AbsoluteReminderRule[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) {
      throw new SchedulingValidationError('Invalid reminder instant');
    }
    const at = instant.toISOString();
    if (seen.has(at)) continue;
    seen.add(at);
    rules.push({
      type: 'absolute',
      at,
      ...(normalizedDue === at ? { preset: 'when_due' as const } : {}),
    });
  }
  return rules as unknown as Json[];
}

export function isWhenDueReminderRule(rules: Json[] | null | undefined, instant: string): boolean {
  if (!Array.isArray(rules)) return false;
  const normalized = new Date(instant);
  if (Number.isNaN(normalized.getTime())) return false;
  const at = normalized.toISOString();
  return rules.some((rule) => {
    if (
      rule === null
      || Array.isArray(rule)
      || typeof rule !== 'object'
      || rule.type !== 'absolute'
      || rule.preset !== 'when_due'
      || typeof rule.at !== 'string'
    ) return false;
    const candidate = new Date(rule.at);
    return !Number.isNaN(candidate.getTime()) && candidate.toISOString() === at;
  });
}

export function reminderInstantsFromRules(rules: Json[] | null | undefined): string[] {
  if (!Array.isArray(rules)) return [];
  const values: string[] = [];
  for (const rule of rules) {
    if (!rule || Array.isArray(rule) || typeof rule !== 'object') continue;
    if (rule.type !== 'absolute' || typeof rule.at !== 'string') continue;
    const instant = new Date(rule.at);
    if (!Number.isNaN(instant.getTime())) values.push(instant.toISOString());
  }
  return [...new Set(values)].sort();
}

export function reminderInstantsForOccurrence(
  schedule: WorkSchedule,
  effectiveDate: string,
): Array<{ at: string; ruleKey: string; preset: ReminderPresetId | null }> {
  if (!Array.isArray(schedule.reminderRules)) return [];
  const result: Array<{ at: string; ruleKey: string; preset: ReminderPresetId | null }> = [];
  schedule.reminderRules.forEach((rule, index) => {
    if (!rule || Array.isArray(rule) || typeof rule !== 'object') return;
    if (rule.type === 'absolute' && typeof rule.at === 'string') {
      const instant = new Date(rule.at);
      if (!Number.isNaN(instant.getTime()) && schedule.scheduleType === 'one_off') {
        result.push({ at: instant.toISOString(), ruleKey: `absolute:${index}`, preset: null });
      }
      return;
    }
    if (rule.type !== 'preset' || typeof rule.preset !== 'string') return;
    const preset = rule.preset as ReminderPresetId;
    if (![
      'when_due', '5m_before', '1d_before_9am', '9am_on_due_date',
      '12pm_on_due_date', '6pm_on_due_date',
    ].includes(preset)) return;
    const timeZone = typeof rule.timeZone === 'string'
      ? rule.timeZone
      : schedule.timeZone ?? 'UTC';
    let date = effectiveDate;
    let time = schedule.scheduleTime ?? '12:00:00';
    if (preset === '1d_before_9am') {
      date = addCalendarDays(effectiveDate, -1);
      time = '09:00:00';
    } else if (preset === '9am_on_due_date') time = '09:00:00';
    else if (preset === '12pm_on_due_date') time = '12:00:00';
    else if (preset === '6pm_on_due_date') time = '18:00:00';
    let at = scheduleDueInstantIso({ scheduleDate: date, scheduleTime: time, timeZone }, timeZone);
    if (preset === '5m_before') at = new Date(Date.parse(at) - 5 * 60_000).toISOString();
    result.push({ at, ruleKey: `preset:${preset}:${index}`, preset });
  });
  return result;
}

export function scheduleMatchesLegacyView(
  schedule: WorkSchedule,
  dueValue: string,
  reminders: string[],
): boolean {
  const currentReminders = reminderInstantsFromRules(schedule.reminderRules);
  return scheduleToLegacyDueValue(schedule) === dueValue
    && currentReminders.length === reminders.length
    && currentReminders.every((value, index) => value === reminders[index]);
}
