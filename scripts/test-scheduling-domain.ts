import assert from 'node:assert/strict';
import {
  SchedulingValidationError,
  implicitOccurrenceState,
  isCalendarDate,
  normalizeWorkScheduleInput,
  scheduleMatchesDate,
  type WorkSchedule,
} from '../lib/scheduling-domain';
import {
  calendarDateInTimeZone,
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

const recurringBase: WorkSchedule = {
  id: 'schedule-1',
  organizationId: 'organization-1',
  teamId: 'team-1',
  source: { sourceType: 'action', taskId: 'task-1' },
  scheduleType: 'recurring',
  scheduleDate: '2026-10-05',
  scheduleTime: null,
  timeZone: null,
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

const timed = normalizeWorkScheduleInput({
  source: { sourceType: 'checklist_item', taskId: 'task-1', checklistItemId: 'legacy-123' },
  scheduleType: 'one_off',
  scheduleDate: '2026-10-09',
  scheduleTime: '10:45',
  timeZone: 'Europe/Istanbul',
});
assert.equal(timed.scheduleDate, '2026-10-09');
assert.equal(timed.scheduleTime, '10:45');
assert.equal(timed.timeZone, 'Europe/Istanbul');

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
  isRecurring: false,
  recurrenceFrequency: null,
  recurrenceInterval: 1,
  recurrenceWeekdays: [],
  endsOn: null,
  reminderRules: [],
  missedCount: 0,
  ...overrides,
});

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

console.log('Scheduling and Planner projection tests passed.');
