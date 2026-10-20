import assert from 'node:assert/strict';
import {
  SchedulingValidationError,
  implicitOccurrenceState,
  isCalendarDate,
  normalizeWorkScheduleInput,
  scheduleMatchesDate,
  countRecurrenceBefore,
  calendarDatesInRange,
  addCalendarDays,
  type WorkSchedule,
} from '../lib/scheduling-domain';
import { PlannerMutationGuard } from '../lib/planner-mutation-guard';
import {
  calendarDateInTimeZone,
  dueBucketDeliveryInstantIso,
  legacyDueValueToSchedule,
  reminderInstantsFromRules,
  reminderRulesFromInstants,
  reminderInstantsForOccurrence,
  isWhenDueReminderRule,
  scheduleDueInstantIso,
  scheduleToLegacyDueValue,
} from '../lib/scheduling-runtime';
import {
  buildPlannerTodayProjection,
  buildPlannerUpcomingProjection,
  type PlannerProjectionItem,
} from '../lib/planner-projection';
import { setChecklistItemCheckedInDocument } from '../components/editor/reorderChecklistItem';
import { canonicalNotificationLink } from '../lib/notification-nav-link';
import { layoutPlannerTimeline, parsePlannerCapture } from '../lib/planner-v2-utils';

const recurringBase: WorkSchedule = {
  id: 'schedule-1',
  organizationId: 'organization-1',
  teamId: 'team-1',
  source: { sourceType: 'action', taskId: 'task-1' },
  scheduleType: 'recurring',
  scheduleDate: '2026-10-05',
  scheduleTime: null,
  timeZone: null,
  durationMinutes: null,
  recurrenceFrequency: 'daily',
  recurrenceInterval: 1,
  recurrenceWeekdays: [],
  endsOn: null,
  reminderRules: [],
  archivedAt: null,
  createdAt: '2026-10-05T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
};

assert.equal(isCalendarDate('2026-10-09'), true);
assert.equal(isCalendarDate('2026-02-30'), false);
assert.equal(scheduleMatchesDate(recurringBase, '2026-10-09'), true);
assert.equal(
  dueBucketDeliveryInstantIso('2026-10-09', 'due_today', 'Europe/Istanbul'),
  '2026-10-09T06:00:00.000Z',
);
assert.equal(
  dueBucketDeliveryInstantIso('2026-10-09', 'due_tomorrow', 'Europe/Istanbul'),
  '2026-10-09T15:00:00.000Z',
);

const everyOtherDay = { ...recurringBase, recurrenceInterval: 2 };
assert.equal(scheduleMatchesDate(everyOtherDay, '2026-10-07'), true);
assert.equal(scheduleMatchesDate(everyOtherDay, '2026-10-08'), false);

const weekdays = {
  ...recurringBase,
  recurrenceFrequency: 'weekly' as const,
  recurrenceWeekdays: [1, 2, 3, 4, 5],
};
assert.equal(scheduleMatchesDate(weekdays, '2026-10-09'), true); // Friday
assert.equal(scheduleMatchesDate(weekdays, '2026-10-10'), false); // Saturday

const alternateMondays = {
  ...weekdays,
  recurrenceInterval: 2,
  recurrenceWeekdays: [1],
};
assert.equal(scheduleMatchesDate(alternateMondays, '2026-10-05'), true);
assert.equal(scheduleMatchesDate(alternateMondays, '2026-10-12'), false);
assert.equal(scheduleMatchesDate(alternateMondays, '2026-10-19'), true);

const bounded = { ...recurringBase, endsOn: '2026-10-09' };
assert.equal(scheduleMatchesDate(bounded, '2026-10-10'), false);
assert.equal(implicitOccurrenceState(recurringBase, '2026-10-09', null), 'pending');

// Differential check against the previous daily expansion, including interval
// weeks anchored on a non-Monday and bounded schedules.
for (const frequency of ['daily', 'weekly'] as const) {
  for (const interval of [1, 2, 3, 7]) {
    for (const end of [null, '2026-11-10']) {
      const schedule = { ...recurringBase, scheduleDate: '2026-10-07',
        recurrenceFrequency: frequency, recurrenceInterval: interval,
        recurrenceWeekdays: frequency === 'weekly' ? [1, 3, 5, 7] : [], endsOn: end };
      for (let days = 0; days < 100; days++) {
        const before = addCalendarDays(schedule.scheduleDate, days);
        const expected = days === 0 ? 0 : calendarDatesInRange(schedule.scheduleDate, addCalendarDays(before, -1))
          .filter(date => scheduleMatchesDate(schedule, date)).length;
        assert.equal(countRecurrenceBefore(schedule, before), expected);
      }
    }
  }
}
const historical = { ...recurringBase, scheduleDate: '2016-01-01' };
const sampleDates = calendarDatesInRange('2026-10-01', '2026-10-14');
const baselineStarted = performance.now();
const baselineCounts = sampleDates.map(date => calendarDatesInRange(historical.scheduleDate, addCalendarDays(date, -1))
  .filter(day => scheduleMatchesDate(historical, day)).length);
const baselineMs = performance.now() - baselineStarted;
const optimizedStarted = performance.now();
const optimizedCounts = sampleDates.map(date => countRecurrenceBefore(historical, date));
const optimizedMs = performance.now() - optimizedStarted;
assert.deepEqual(optimizedCounts, baselineCounts);
console.log('14-day recurrence count, 10-year template (local CPU only):', { baselineMs, optimizedMs });

const timed = normalizeWorkScheduleInput({
  source: { sourceType: 'checklist_item', taskId: 'task-1', checklistItemId: 'legacy-123' },
  scheduleType: 'one_off',
  scheduleDate: '2026-10-09',
  scheduleTime: '10:45',
  timeZone: 'Europe/Istanbul',
  durationMinutes: 45,
});
assert.equal(timed.scheduleDate, '2026-10-09');
assert.equal(timed.scheduleTime, '10:45');
assert.equal(timed.timeZone, 'Europe/Istanbul');
assert.equal(timed.durationMinutes, 45);
assert.deepEqual(parsePlannerCapture('Yarın saat 14.30 dişçiyi ara', '2026-10-20'), {
  title: 'dişçiyi ara',
  date: '2026-10-21',
  time: '14:30',
});

assert.throws(
  () => normalizeWorkScheduleInput({
    source: { sourceType: 'action', taskId: 'task-1' },
    scheduleType: 'one_off',
    scheduleDate: '2026-10-09',
    durationMinutes: 30,
  }),
  SchedulingValidationError,
);

assert.throws(
  () => normalizeWorkScheduleInput({
    source: { sourceType: 'action', taskId: 'task-1' },
    scheduleType: 'one_off',
    scheduleDate: '2026-10-09',
    scheduleTime: '10:45',
  }),
  SchedulingValidationError,
);
assert.throws(
  () => normalizeWorkScheduleInput({
    source: { sourceType: 'action', taskId: 'task-1' },
    scheduleType: 'recurring',
    scheduleDate: '2026-10-09',
    recurrenceFrequency: 'weekly',
    recurrenceWeekdays: [0, 8],
  }),
  SchedulingValidationError,
);

assert.deepEqual(
  legacyDueValueToSchedule('2026-10-09', 'Europe/Istanbul'),
  { scheduleDate: '2026-10-09', scheduleTime: null, timeZone: null },
);
assert.deepEqual(
  legacyDueValueToSchedule('2026-10-09T00:00:00.000Z', 'Europe/Istanbul'),
  { scheduleDate: '2026-10-09', scheduleTime: null, timeZone: null },
);
assert.deepEqual(
  legacyDueValueToSchedule('2026-10-09T09:00:00.000Z', 'Europe/Istanbul'),
  { scheduleDate: '2026-10-09', scheduleTime: null, timeZone: null },
);
const timedFields = legacyDueValueToSchedule('2026-10-09T07:45:00.000Z', 'Europe/Istanbul');
assert.deepEqual(timedFields, {
  scheduleDate: '2026-10-09',
  scheduleTime: '10:45:00',
  timeZone: 'Europe/Istanbul',
});
assert.equal(scheduleToLegacyDueValue({
  ...recurringBase,
  scheduleType: 'one_off',
  scheduleDate: timedFields.scheduleDate,
  scheduleTime: timedFields.scheduleTime,
  timeZone: timedFields.timeZone,
  recurrenceFrequency: null,
  recurrenceWeekdays: [],
}), '2026-10-09T07:45:00.000Z');
assert.equal(scheduleDueInstantIso(
  { scheduleDate: '2026-10-09', scheduleTime: null, timeZone: null },
  'Europe/Istanbul',
), '2026-10-09T09:00:00.000Z');
assert.equal(
  calendarDateInTimeZone(new Date('2026-10-09T21:30:00.000Z'), 'Europe/Istanbul'),
  '2026-10-10',
);
assert.equal(
  calendarDateInTimeZone(new Date('2026-10-09T06:30:00.000Z'), 'America/Los_Angeles'),
  '2026-10-08',
);
const reminderRules = reminderRulesFromInstants([
  '2026-10-09T07:45:00.000Z',
  '2026-10-09T07:45:00Z',
], '2026-10-09T07:45:00.000Z');
assert.deepEqual(reminderInstantsFromRules(reminderRules), ['2026-10-09T07:45:00.000Z']);
assert.equal(isWhenDueReminderRule(reminderRules, '2026-10-09T07:45:00Z'), true);
const recurringWithReminder: WorkSchedule = {
  ...recurringBase,
  scheduleTime: '10:45:00',
  timeZone: 'Europe/Istanbul',
  reminderRules: [{ type: 'preset', preset: '5m_before', timeZone: 'Europe/Istanbul' }],
};
assert.deepEqual(reminderInstantsForOccurrence(recurringWithReminder, '2026-10-09'), [{
  at: '2026-10-09T07:40:00.000Z',
  ruleKey: 'preset:5m_before:0',
  preset: '5m_before',
}]);

const plannerItem = (
  overrides: Partial<PlannerProjectionItem>,
): PlannerProjectionItem => ({
  id: 'schedule-1:2026-10-09',
  source: { sourceType: 'action', taskId: 'task-1' },
  scheduleId: 'schedule-1',
  scheduleDate: '2026-10-09',
  occurrenceDate: '2026-10-09',
  effectiveDate: '2026-10-09',
  state: 'pending',
  completedAt: null,
  organizationId: 'organization-1',
  teamId: 'team-1',
  taskId: 'task-1',
  taskTitle: 'Action due today',
  checklistItemId: null,
  checklistItemText: null,
  projectId: null,
  projectName: null,
  assigneeId: null,
  scheduleTime: null,
  timeZone: null,
  durationMinutes: null,
  isRecurring: false,
  recurrenceFrequency: null,
  recurrenceInterval: 1,
  recurrenceWeekdays: [],
  endsOn: null,
  reminderRules: [],
  missedCount: 0,
  ...overrides,
});

const overlappingBlocks = layoutPlannerTimeline([
  plannerItem({ id: 'block-a', scheduleTime: '09:00', durationMinutes: 60 }),
  plannerItem({ id: 'block-b', scheduleTime: '09:30', durationMinutes: 30 }),
  plannerItem({ id: 'block-c', scheduleTime: '10:00', durationMinutes: 30 }),
]);
assert.equal(overlappingBlocks.find((block) => block.item.id === 'block-a')?.lane, 0);
assert.equal(overlappingBlocks.find((block) => block.item.id === 'block-b')?.lane, 1);
assert.equal(overlappingBlocks.find((block) => block.item.id === 'block-c')?.lane, 0);

const todayProjection = buildPlannerTodayProjection([
  plannerItem({ id: 'today-action' }),
  plannerItem({
    id: 'overdue-checklist',
    source: { sourceType: 'checklist_item', taskId: 'task-2', checklistItemId: 'item-2' },
    taskId: 'task-2',
    checklistItemId: 'item-2',
    checklistItemText: 'Overdue checklist item',
    scheduleDate: '2026-10-08',
    occurrenceDate: '2026-10-08',
    effectiveDate: '2026-10-08',
  }),
  plannerItem({
    id: 'completed-today-istanbul',
    state: 'completed',
    completedAt: '2026-10-08T22:30:00.000Z', // 9 October in Istanbul
  }),
  plannerItem({
    id: 'completed-yesterday-istanbul',
    state: 'completed',
    completedAt: '2026-10-08T19:30:00.000Z',
  }),
], '2026-10-09', 'Europe/Istanbul');
assert.deepEqual(todayProjection.today.map((item) => item.id), ['today-action']);
assert.deepEqual(todayProjection.overdue.map((item) => item.id), ['overdue-checklist']);
assert.deepEqual(todayProjection.completedToday.map((item) => item.id), ['completed-today-istanbul']);
const upcomingProjection = buildPlannerUpcomingProjection([
  plannerItem({ id: 'tomorrow', effectiveDate: '2026-10-10', occurrenceDate: '2026-10-10' }),
  plannerItem({ id: 'later', effectiveDate: '2026-10-12', occurrenceDate: '2026-10-12' }),
  plannerItem({ id: 'skipped', effectiveDate: '2026-10-10', state: 'skipped' }),
], '2026-10-10', '2026-10-23');
assert.deepEqual(upcomingProjection.groups.map((group) => group.date), ['2026-10-10', '2026-10-12']);
assert.deepEqual(upcomingProjection.groups[0].items.map((item) => item.id), ['tomorrow']);

const checklistDocument = {
  type: 'doc',
  content: [{
    type: 'taskList',
    content: [{
      type: 'taskItem',
      attrs: { id: 'stable-item', checked: false, completedAt: null, assigneeId: null },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Scheduled work' }] }],
    }],
  }],
};
const completedDocument = setChecklistItemCheckedInDocument(
  checklistDocument,
  'stable-item',
  true,
  '2026-10-09T10:00:00.000Z',
);
assert.equal(completedDocument.content[0].content[0].attrs.id, 'stable-item');
assert.equal(completedDocument.content[0].content[0].attrs.checked, true);
const reopenedDocument = setChecklistItemCheckedInDocument(completedDocument, 'stable-item', false);
assert.equal(reopenedDocument.content[0].content[0].attrs.id, 'stable-item');
assert.equal(reopenedDocument.content[0].content[0].attrs.checked, false);

assert.equal(
  canonicalNotificationLink('/board?task=task-1&project=project-1&checklist=item-1&r=cRem&schedule=schedule-1&occurrence=2026-10-09&rule=preset%3Awhen_due%3A0'),
  '/board?task=task-1&project=project-1&checklist=item-1',
);
assert.equal(
  canonicalNotificationLink('/board?task=task-1&r=taskOverdue&w=2#details'),
  '/board?task=task-1#details',
);

const mutationGuard = new PlannerMutationGuard();
const beforeMutations = mutationGuard.snapshot();
assert.equal(mutationGuard.canApply(beforeMutations), true);
mutationGuard.begin();
const duringFirstMutation = mutationGuard.snapshot();
assert.equal(mutationGuard.canApply(beforeMutations), false);
mutationGuard.begin();
assert.equal(mutationGuard.finish(), false);
assert.equal(mutationGuard.canApply(duringFirstMutation), false);
assert.equal(mutationGuard.finish(), true);
assert.equal(mutationGuard.canApply(duringFirstMutation), false);
assert.equal(mutationGuard.canApply(mutationGuard.snapshot()), true);

console.log('Scheduling and Planner projection tests passed.');
