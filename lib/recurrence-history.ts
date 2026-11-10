import {
  addCalendarDays,
  calendarDatesInRange,
  scheduleMatchesDate,
  type WorkOccurrence,
  type WorkSchedule,
} from '@/lib/scheduling-domain';

/**
 * A recurrence has virtual calendar slots. Only exceptions (completed, skipped,
 * rescheduled) are persisted. Do not create one task or database row per day.
 */
export type RecurrenceHistoryStatus =
  | 'completed'
  | 'skipped'
  | 'missed'
  | 'today'
  | 'upcoming'
  | 'rescheduled';

export type RecurrenceHistoryDay = {
  date: string;
  effectiveDate: string;
  status: RecurrenceHistoryStatus;
  completedAt: string | null;
};

export type RecurrenceHistoryStats = {
  completed: number;
  missed: number;
  skipped: number;
  rescheduled: number;
  pendingToday: number;
  eligible: number;
  completionRate: number | null;
  completionStreak: number;
  missedStreak: number;
};

export type RecurrenceHistory = {
  scheduleId: string;
  today: string;
  startDate: string;
  endDate: string;
  days: RecurrenceHistoryDay[];
  stats: RecurrenceHistoryStats;
};

export function recurrenceHistoryDayStatus(
  date: string,
  effectiveDate: string,
  state: WorkOccurrence['state'] | 'pending',
  today: string,
): RecurrenceHistoryStatus {
  if (state === 'completed') return 'completed';
  if (state === 'skipped') return 'skipped';
  if (effectiveDate > today && date !== effectiveDate) return 'rescheduled';
  if (effectiveDate < today) return 'missed';
  if (effectiveDate === today) return 'today';
  return 'upcoming';
}

export function summarizeRecurrenceHistory(days: readonly RecurrenceHistoryDay[], today: string): RecurrenceHistoryStats {
  const completed = days.filter(item => item.status === 'completed').length;
  const missed = days.filter(item => item.status === 'missed').length;
  const skipped = days.filter(item => item.status === 'skipped').length;
  const rescheduled = days.filter(item => item.status === 'rescheduled').length;
  const pendingToday = days.filter(item => item.status === 'today').length;
  const eligible = completed + missed;
  const completionRate = eligible ? Math.round((completed / eligible) * 100) : null;

  // Streaks count scheduled *occurrences*, not absolute calendar days. Today
  // is unfinished until the day ends, so don't break a legitimate streak.
  const historical = days.filter(day => day.date < today).slice().reverse();
  const streak = (target: RecurrenceHistoryStatus) => {
    let count = 0;
    for (const day of historical) {
      if (day.status !== target) break;
      count += 1;
    }
    return count;
  };
  return {
    completed, missed, skipped, rescheduled, pendingToday, eligible,
    completionRate, completionStreak: streak('completed'), missedStreak: streak('missed'),
  };
}

export function buildRecurrenceHistory(
  schedule: WorkSchedule,
  persisted: readonly WorkOccurrence[],
  today: string,
  windowDays = 30,
): RecurrenceHistory {
  if (schedule.scheduleType !== 'recurring') throw new Error('History requires a recurring schedule');
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 180) {
    throw new Error('History window must be 1–180 days');
  }
  const startDate = addCalendarDays(today, 1 - windowDays);
  const endDate = today;
  const byOrigin = new Map(persisted
    .filter(item => item.scheduleId === schedule.id)
    .map(item => [item.occurrenceDate, item]));
  const days = calendarDatesInRange(startDate, endDate)
    .filter(date => scheduleMatchesDate(schedule, date))
    .map((date): RecurrenceHistoryDay => {
      const record = byOrigin.get(date);
      const effectiveDate = record?.effectiveDate ?? date;
      return {
        date,
        effectiveDate,
        status: recurrenceHistoryDayStatus(date, effectiveDate, record?.state ?? 'pending', today),
        completedAt: record?.completedAt ?? null,
      };
    });
  return {
    scheduleId: schedule.id,
    today,
    startDate,
    endDate,
    days,
    stats: summarizeRecurrenceHistory(days, today),
  };
}

/**
 * Bounded streak computed from most recent scheduled days. No history writes.
 * Used by the cron checker for one alert after three successive missed slots.
 */
export function countRecentMissedOccurrences(
  schedule: WorkSchedule,
  persisted: readonly WorkOccurrence[],
  today: string,
  maxLookbackDays = 180,
): { count: number; oldestMissedDate: string | null } {
  const history = buildRecurrenceHistory(schedule, persisted, today, maxLookbackDays);
  const days = history.days.filter(day => day.date < today).reverse();
  let count = 0;
  let oldestMissedDate: string | null = null;
  for (const day of days) {
    if (day.status !== 'missed') break;
    count += 1;
    oldestMissedDate = day.date;
  }
  return { count, oldestMissedDate };
}

/** Local-morning, coarse hourly gate for opt-in missed-work notifications. */
export function missedRecurrenceAlertWindow(now: Date, timeZone: string): boolean {
  if (now.getUTCMinutes() >= 10) return false;
  const hourString = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone,
  }).format(now);
  const hour = Number(hourString);
  return Number.isInteger(hour) && hour >= 9 && hour <= 12;
}
