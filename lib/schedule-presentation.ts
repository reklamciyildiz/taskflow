import type { Json } from '@/lib/database.types';
import type { ReminderPresetId } from '@/lib/reminder-presets';
import type { WorkSchedule } from '@/lib/scheduling-domain';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function recurrenceLabel(schedule: WorkSchedule): string | null {
  if (schedule.scheduleType !== 'recurring') return null;
  let label = 'Recurring';
  if (schedule.recurrenceFrequency === 'daily') label = 'Daily';
  else if (schedule.recurrenceWeekdays.join(',') === '1,2,3,4,5') label = 'Weekdays';
  else if (schedule.recurrenceWeekdays.length === 1) label = 'Weekly';
  else if (schedule.recurrenceWeekdays.length) {
    label = schedule.recurrenceWeekdays.map((day) => WEEKDAYS[day - 1]).join(' · ');
  }
  if (schedule.endsOn) label += ` · until ${formatScheduleDate(schedule.endsOn)}`;
  return label;
}

export function formatScheduleDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
    .format(new Date(year, month - 1, day, 12));
}

export function scheduleChipLabel(schedule: WorkSchedule): string {
  const recurrence = recurrenceLabel(schedule);
  if (recurrence) return recurrence;
  const time = schedule.scheduleTime ? ` · ${schedule.scheduleTime.slice(0, 5)}` : '';
  return `${formatScheduleDate(schedule.scheduleDate)}${time}`;
}

export function reminderRuleForPreset(preset: ReminderPresetId | null): Json[] {
  return preset ? [{
    type: 'preset',
    preset,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  } as unknown as Json] : [];
}

export function reminderPresetFromRules(rules: Json[] | null | undefined): ReminderPresetId | null {
  if (!Array.isArray(rules)) return null;
  for (const rule of rules) {
    if (!rule || Array.isArray(rule) || typeof rule !== 'object') continue;
    const preset = typeof rule.preset === 'string' ? rule.preset : '';
    if (
      preset === 'when_due'
      || preset === '5m_before'
      || preset === '1d_before_9am'
      || preset === '9am_on_due_date'
      || preset === '12pm_on_due_date'
      || preset === '6pm_on_due_date'
    ) return preset;
  }
  return null;
}
