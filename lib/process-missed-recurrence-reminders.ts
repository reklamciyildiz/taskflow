import { notificationDb } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { listActiveRecurringScheduledWork } from '@/lib/scheduling-runtime-server';
import { calendarDateInTimeZone } from '@/lib/scheduling-runtime';
import { addCalendarDays, isoWeekday, workOccurrenceFromRow, type WorkOccurrence } from '@/lib/scheduling-domain';
import { countRecentMissedOccurrences } from '@/lib/recurrence-history';

/** In-app and opt-in browser push, never email, at most once per ISO week.
 * A user-enabled threshold (2/3/5) triggers the first alert.
 * No notification is generated for a deliberately skipped or moved-forward day.
 */
const HISTORY_LOOKBACK_DAYS = 30;

export type MissedRecurrenceStats = {
  considered: number;
  alerted: number;
  pushesSent: number;
  pushFailures: number;
  deferred: boolean;
};

function localHour(date: Date, timeZone: string): number {
  const value = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone,
  }).format(date);
  return Number(value);
}

export function missedRecurrenceAlertWindow(now: Date, timeZone: string): boolean {
  // Evaluate once per hour, not on every 5-minute cron invocation. Vercel's
  // twice-daily backup can still deliver for time zones within this window.
  if (now.getUTCMinutes() >= 10) return false;
  const hour = localHour(now, timeZone);
  return Number.isInteger(hour) && hour >= 9 && hour <= 12;
}

function chunks<T>(values: T[], size = 200): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

export async function processMissedRecurrenceReminders(nowDate = new Date()): Promise<MissedRecurrenceStats> {
  const result: MissedRecurrenceStats = {
    considered: 0, alerted: 0, pushesSent: 0, pushFailures: 0, deferred: false,
  };
  if (nowDate.getUTCMinutes() >= 10) {
    result.deferred = true;
    return result;
  }
  const templates = (await listActiveRecurringScheduledWork())
    .filter(item => item.recipientId && missedRecurrenceAlertWindow(nowDate, item.recipientTimeZone));
  if (!templates.length) return result;

  // The new columns are opt-in. SELECT * deliberately remains compatible with
  // installations that haven't applied the additive migration: no preference
  // means no alert. The other reminder processors keep working.
  const recipients = [...new Set(templates.map(item => item.recipientId).filter(
    (value): value is string => Boolean(value),
  ))];
  const alertThresholdByUser = new Map<string, number>();
  for (const recipientBatch of chunks(recipients)) {
    const { data, error } = await supabaseAdmin.from('user_settings')
      .select('*').in('user_id', recipientBatch);
    if (error) throw error;
    for (const setting of data ?? []) {
      const value = setting as Record<string, unknown>;
      if (value.recurrence_missed_alerts_enabled !== true) continue;
      const threshold = value.recurrence_missed_alert_threshold;
      alertThresholdByUser.set(String(value.user_id),
        threshold === 2 || threshold === 3 || threshold === 5 ? threshold : 3);
    }
  }
  const optedTemplates = templates.filter(item =>
    Boolean(item.recipientId && alertThresholdByUser.has(item.recipientId)));
  if (!optedTemplates.length) return result;

  const earliestUtcDate = addCalendarDays(nowDate.toISOString().slice(0, 10), -32);
  const rows: WorkOccurrence[] = [];
  for (const group of chunks([...new Set(optedTemplates.map(item => item.schedule.id))])) {
    const { data, error } = await supabaseAdmin.from('work_occurrences')
      .select('*')
      .in('schedule_id', group)
      .gte('occurrence_date', earliestUtcDate);
    if (error) throw error;
    rows.push(...(data ?? []).map(workOccurrenceFromRow));
  }
  const bySchedule = new Map<string, WorkOccurrence[]>();
  for (const row of rows) {
    const existing = bySchedule.get(row.scheduleId) ?? [];
    existing.push(row);
    bySchedule.set(row.scheduleId, existing);
  }

  for (const work of optedTemplates) {
    if (!work.recipientId) continue;
    const threshold = alertThresholdByUser.get(work.recipientId) ?? 3;
    const localToday = calendarDateInTimeZone(nowDate, work.recipientTimeZone);
    if (work.schedule.scheduleDate >= localToday ||
        (work.schedule.endsOn && work.schedule.endsOn < localToday)) continue;
    result.considered += 1;
    const { count } = countRecentMissedOccurrences(
      work.schedule,
      bySchedule.get(work.schedule.id) ?? [],
      localToday,
      HISTORY_LOOKBACK_DAYS,
    );
    if (count < threshold) continue;

    const weekStart = addCalendarDays(localToday, 1 - isoWeekday(localToday));
    const isChecklist = work.sourceType === 'checklist_item';
    const query = new URLSearchParams({
      task: work.taskId,
      ...(work.projectId ? { project: work.projectId } : {}),
      ...(work.checklistItemId ? { checklist: work.checklistItemId } : {}),
    });
    const openLink = '/board?' + query.toString();
    // Reuse existing internal query keys so notification navigation strips the
    // dedupe information. A stable per-week link guarantees at most one insert
    // even if multiple cron workers overlap.
    query.set('r', 'recurringMissed');
    query.set('schedule', work.schedule.id);
    query.set('occurrence', weekStart);
    const type = isChecklist ? 'checklist_reminder' : 'task_reminder';
    const title = 'Recurring work needs attention';
    const taskTitle = isChecklist ? (work.checklistItemText || work.taskTitle) : work.taskTitle;
    const inserted = await notificationDb.tryInsert({
      user_id: work.recipientId,
      organization_id: work.organizationId,
      type,
      title,
      message: 'You missed ' + count + ' recent scheduled occurrences of "' + taskTitle + '". Review your history or update your schedule.',
      link: '/board?' + query.toString(),
    });
    if (!inserted) continue;
    result.alerted += 1;
    const push = await sendPushToUser(work.recipientId, {
      title: 'Recurring work needs attention',
      body: 'Missed ' + count + ' times: ' + taskTitle.slice(0, 110),
      url: openLink,
      tag: 'recurrence-missed:' + work.schedule.id + ':' + weekStart,
    });
    result.pushesSent += push.sent;
    result.pushFailures += push.failed;
  }
  return result;
}
