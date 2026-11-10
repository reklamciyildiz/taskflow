import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addCalendarDays, scheduleMatchesDate, type WorkOccurrence, type WorkSchedule } from '../lib/scheduling-domain';
import {
  buildRecurrenceHistory,
  countRecentMissedOccurrences,
  missedRecurrenceAlertWindow,
  recurrenceHistoryDayStatus,
  summarizeRecurrenceHistory,
} from '../lib/recurrence-history';

const template: WorkSchedule = {
  id: 'schedule-daily',
  organizationId: 'org-1',
  teamId: 'team-1',
  source: { sourceType: 'action', taskId: 'task-1' },
  scheduleType: 'recurring',
  scheduleDate: '2026-11-06',
  scheduleTime: null,
  timeZone: null,
  durationMinutes: null,
  recurrenceFrequency: 'daily',
  recurrenceInterval: 1,
  recurrenceWeekdays: [],
  endsOn: null,
  reminderRules: [],
  archivedAt: null,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
};

const occurrence = (
  occurrenceDate: string,
  state: WorkOccurrence['state'],
  effectiveDate = occurrenceDate,
): WorkOccurrence => ({
  id: occurrenceDate,
  scheduleId: template.id,
  occurrenceDate,
  effectiveDate,
  state,
  completedAt: state === 'completed' ? occurrenceDate + 'T13:00:00.000Z' : null,
  rescheduledAt: effectiveDate !== occurrenceDate ? '2026-11-07T00:00:00.000Z' : null,
  createdAt: occurrenceDate + 'T00:00:00.000Z',
  updatedAt: occurrenceDate + 'T00:00:00.000Z',
});

const today = '2026-11-10';
const history = buildRecurrenceHistory(template, [
  occurrence('2026-11-07', 'completed'),
  occurrence('2026-11-09', 'skipped'),
], today, 7);
assert.deepEqual(history.days.map(day => [day.date, day.status]), [
  ['2026-11-06', 'missed'],
  ['2026-11-07', 'completed'],
  ['2026-11-08', 'missed'],
  ['2026-11-09', 'skipped'],
  ['2026-11-10', 'today'],
]);
assert.equal(history.stats.completed, 1);
assert.equal(history.stats.missed, 2);
assert.equal(history.stats.skipped, 1);
assert.equal(history.stats.completionRate, 33);
assert.equal(history.stats.missedStreak, 0);
assert.equal(history.stats.pendingToday, 1);
assert.equal(history.days.length, 5);

const unmodified = buildRecurrenceHistory(template, [], today, 7);
assert.equal(unmodified.stats.missed, 4);
assert.equal(unmodified.stats.missedStreak, 4);
assert.equal(countRecentMissedOccurrences(template, [], today, 30).count, 4);
assert.equal(countRecentMissedOccurrences(template, [], today, 30).oldestMissedDate, '2026-11-06');
assert.equal(unmodified.days.find(day=>day.date===today)?.status,'today');

const moved = buildRecurrenceHistory(template, [
  occurrence('2026-11-09', 'pending', '2026-11-12'),
], today, 7);
assert.equal(moved.days.find(day=>day.date==='2026-11-09')?.status,'rescheduled');
assert.equal(moved.stats.missed, 3);
assert.equal(moved.stats.rescheduled, 1);
assert.equal(countRecentMissedOccurrences(template,[
  occurrence('2026-11-09','pending','2026-11-12'),
],today).count,0);
assert.equal(recurrenceHistoryDayStatus('2026-11-08','2026-11-08','pending',today),'missed');
assert.equal(recurrenceHistoryDayStatus('2026-11-10','2026-11-10','pending',today),'today');
assert.equal(recurrenceHistoryDayStatus('2026-11-07','2026-11-07','completed',today),'completed');
assert.equal(recurrenceHistoryDayStatus('2026-11-07','2026-11-07','skipped',today),'skipped');

const weekly = {
  ...template,
  id: 'weekly-1',
  scheduleDate: '2026-10-26',
  recurrenceFrequency: 'weekly' as const,
  recurrenceWeekdays: [1],
  recurrenceInterval: 1,
};
const weeklyHistory = buildRecurrenceHistory(weekly, [], '2026-11-10',30);
assert.deepEqual(weeklyHistory.days.map(day=>day.date),[
  '2026-10-26','2026-11-02','2026-11-09',
]);
assert.equal(weeklyHistory.stats.missed,3);
// 5 weekly misses need at least 35 days of virtual history.
const longWeekly = buildRecurrenceHistory(weekly, [], '2026-12-01', 90);
assert.ok(longWeekly.stats.missed >= 5);
assert.equal(countRecentMissedOccurrences(weekly, [], '2026-12-01', 180).count >= 5, true);
// Every second Monday must not count intervening Mondays as missed.
const biWeekly = { ...weekly, recurrenceInterval: 2 };
assert.equal(scheduleMatchesDate(biWeekly,'2026-11-02'),false);
assert.equal(buildRecurrenceHistory(biWeekly,[],today,30).stats.missed,2);

const completeStreak = buildRecurrenceHistory(template, [
  occurrence('2026-11-08','completed'),
  occurrence('2026-11-09','completed'),
],today,7);
assert.equal(completeStreak.stats.completionStreak,2);
assert.equal(completeStreak.stats.missedStreak,0);
assert.equal(completeStreak.stats.completionRate,50);

// Weekends in a Mon–Fri series are unscheduled, not failures.
const weekdaySchedule={...weekly,recurrenceWeekdays:[1,2,3,4,5],scheduleDate:'2026-11-02'};
const weekdayHistory=buildRecurrenceHistory(weekdaySchedule,[],today,7);
assert.equal(weekdayHistory.days.some(day=>day.date==='2026-11-07'),false);
assert.equal(weekdayHistory.days.some(day=>day.date==='2026-11-08'),false);

// No completion denominator when all past occurrences were deliberately skipped.
const allSkipped=buildRecurrenceHistory(template,[
  occurrence('2026-11-06','skipped'),
  occurrence('2026-11-07','skipped'),
  occurrence('2026-11-08','skipped'),
  occurrence('2026-11-09','skipped'),
],today,7);
assert.equal(allSkipped.stats.eligible,0);
assert.equal(allSkipped.stats.completionRate,null);
assert.equal(summarizeRecurrenceHistory([],today).completionRate,null);
assert.throws(()=>buildRecurrenceHistory(template,[],today,181),/window/);

// Timezone-aware local alert check; 06:00 UTC = 09:00 Istanbul on 10 Nov.
assert.equal(missedRecurrenceAlertWindow(new Date('2026-11-10T06:00:00.000Z'),'Europe/Istanbul'),true);
assert.equal(missedRecurrenceAlertWindow(new Date('2026-11-10T06:09:00.000Z'),'Europe/Istanbul'),true);
assert.equal(missedRecurrenceAlertWindow(new Date('2026-11-10T06:10:00.000Z'),'Europe/Istanbul'),false);
assert.equal(missedRecurrenceAlertWindow(new Date('2026-11-10T06:00:00.000Z'),'America/Los_Angeles'),false);
assert.equal(missedRecurrenceAlertWindow(new Date('2026-11-10T12:00:00.000Z'),'Europe/Istanbul'),false);
assert.equal(addCalendarDays('2026-12-31',1),'2027-01-01');

const read=(file:string)=>readFileSync(file,'utf8');
const api=read('app/api/planner/history/route.ts');
assert.match(api,/requireAuthedUser\(request\)/);
assert.match(api,/getRecurrenceHistory/);
assert.match(api,/Cache-Control.*private, no-store/);
const server=read('lib/work-schedule-server.ts');
assert.match(server,/requireScheduleAccess\(actor, scheduleId, false\)/);
assert.match(server,/existing\.state !== 'completed' && existing\.state !== 'skipped'/);
assert.match(server,/buildRecurrenceHistory\(schedule/);

const userPrefs=read('app/api/users/settings/route.ts');
assert.match(userPrefs,/recurrence_missed_alerts_enabled/);
assert.match(userPrefs,/value === 2 \|\| value === 3 \|\| value === 5/);
const cron=read('lib/process-missed-recurrence-reminders.ts');
assert.match(cron,/recurrence_missed_alerts_enabled !== true/);
assert.match(cron,/if \(count < threshold\) continue/);
assert.match(cron,/query\.set\('occurrence', weekStart\)/);
assert.match(cron,/notificationDb\.tryInsert/);
assert.match(cron,/sendPushToUser/);
assert.doesNotMatch(cron,/sendEmail|sendMail|mailer/);
const dispatcher=read('app/api/cron/reminders-tick/route.ts');
assert.match(dispatcher,/processMissedRecurrenceReminders\(\)/);
assert.match(dispatcher,/missedResult\.status === 'rejected'/);

for(const file of ['components/PlannerToday.tsx','components/planner/PlannerRoutines.tsx']){
  assert.match(read(file),/RecurrenceHistoryDialog/);
  assert.match(read(file),/History & insights/);
}
const visual=read('components/planner/RecurrenceHistoryDialog.tsx');
assert.match(visual,/Mark completed/);
assert.match(visual,/Restore to pending/);
assert.match(visual,/7 days/);
assert.match(visual,/STATUS_STYLE/);
assert.doesNotMatch(visual,/insert.*task|create.*Action/);
const sql=read('supabase/migrations/20261110213000_missed_recurrence_preferences.sql');
assert.match(sql,/DEFAULT false/);
assert.match(sql,/CHECK \(recurrence_missed_alert_threshold IN \(2, 3, 5\)\)/);
console.log(JSON.stringify({ suite:'recurring-history-v2', status:'passed', liveDatabaseCalls:false }));
