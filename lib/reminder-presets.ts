export type ReminderPresetId =
  | 'when_due'
  | '5m_before'
  | '1d_before_9am'
  | '9am_on_due_date'
  | '12pm_on_due_date'
  | '6pm_on_due_date';

export type ReminderPreset = { id: ReminderPresetId; label: string };

export const REMINDER_PRESETS: ReminderPreset[] = [
  { id: 'when_due', label: 'when task is due' },
  { id: '5m_before', label: '5 mins before' },
  { id: '1d_before_9am', label: '1 day before (9 AM)' },
  { id: '9am_on_due_date', label: '9 AM on due date' },
  { id: '12pm_on_due_date', label: '12 PM on due date' },
  { id: '6pm_on_due_date', label: '6 PM on due date' },
];

function atLocalTime(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function computeReminderInstantsUtcIso(input: {
  dueAt: Date;
  preset: ReminderPresetId;
}): string[] {
  const dueAt = input.dueAt;
  let remind: Date | null = null;
  switch (input.preset) {
    case 'when_due':
      remind = new Date(dueAt);
      break;
    case '5m_before':
      remind = new Date(dueAt.getTime() - 5 * 60_000);
      break;
    case '1d_before_9am': {
      const d = new Date(dueAt);
      d.setDate(d.getDate() - 1);
      remind = atLocalTime(d, 9, 0);
      break;
    }
    case '9am_on_due_date':
      remind = atLocalTime(dueAt, 9, 0);
      break;
    case '12pm_on_due_date':
      remind = atLocalTime(dueAt, 12, 0);
      break;
    case '6pm_on_due_date':
      remind = atLocalTime(dueAt, 18, 0);
      break;
  }
  if (!remind) return [];
  return [remind.toISOString()];
}

export function detectReminderPreset(input: {
  dueAt: Date | null | undefined;
  reminders: string[] | null | undefined;
}): ReminderPresetId | null {
  const dueAt = input.dueAt;
  const rem = input.reminders;
  if (!dueAt) return null;
  if (!Array.isArray(rem) || rem.length === 0) return null;
  const first = rem[0];
  if (typeof first !== 'string' || first.length === 0) return null;
  for (const p of REMINDER_PRESETS) {
    const calc = computeReminderInstantsUtcIso({ dueAt, preset: p.id });
    if (calc[0] === first) return p.id;
  }
  return null;
}

