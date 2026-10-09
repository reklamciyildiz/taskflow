import 'server-only';

import { projectDb, teamMemberDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isOrgAdmin } from '@/lib/server-authz';
import { extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import {
  FALLBACK_BOARD_COLUMNS,
  isTerminalBoardColumn,
  parseColumnConfigFromJson,
} from '@/lib/types';
import {
  assertCalendarDate,
  addCalendarDays,
  calendarDatesInRange,
  isIanaTimeZone,
  scheduleMatchesDate,
  workOccurrenceFromRow,
  workScheduleFromRow,
  type WorkOccurrence,
  type WorkOccurrenceState,
  type WorkSchedule,
} from '@/lib/scheduling-domain';
import type { SchedulingActor } from '@/lib/work-schedule-server';
import {
  buildPlannerTodayProjection,
  buildPlannerUpcomingProjection,
  type PlannerProjectionItem,
  type PlannerTodayProjection,
  type PlannerUpcomingProjection,
} from '@/lib/planner-projection';

type ProjectionOptions = {
  teamId?: string;
  includeOverdueOneOff?: boolean;
};

function projectionId(scheduleId: string, occurrenceDate: string): string {
  return `${scheduleId}:${occurrenceDate}`;
}

function actionState(task: any, project: any | null): WorkOccurrenceState {
  const columns = project
    ? parseColumnConfigFromJson(project.column_config)
    : FALLBACK_BOARD_COLUMNS;
  const effectiveColumns = columns.length ? columns : FALLBACK_BOARD_COLUMNS;
  return isTerminalBoardColumn(String(task.status), effectiveColumns) ? 'completed' : 'pending';
}

function occurrencesForDate(
  schedule: WorkSchedule,
  persisted: WorkOccurrence[],
  date: string,
  includeOverdueOneOff = false,
): Array<{
  occurrenceDate: string;
  effectiveDate: string;
  state: WorkOccurrenceState;
  completedAt: string | null;
}> {
  if (schedule.scheduleType === 'one_off') {
    return schedule.scheduleDate === date || (includeOverdueOneOff && schedule.scheduleDate < date)
      ? [{
          occurrenceDate: schedule.scheduleDate,
          effectiveDate: schedule.scheduleDate,
          state: 'pending',
          completedAt: null,
        }]
      : [];
  }

  const rows = persisted.filter((row) => row.scheduleId === schedule.id);
  const originToday = rows.find((row) => row.occurrenceDate === date);
  const movedHere = rows
    .filter((row) => row.effectiveDate === date && row.occurrenceDate !== date)
    .map((row) => ({
      occurrenceDate: row.occurrenceDate,
      effectiveDate: row.effectiveDate,
      state: row.state,
      completedAt: row.completedAt,
    }));

  const result = [...movedHere];
  if (
    movedHere.length === 0
    && scheduleMatchesDate(schedule, date)
    && (!originToday || originToday.effectiveDate === date)
  ) {
    result.push({
      occurrenceDate: date,
      effectiveDate: date,
      state: originToday?.state ?? 'pending',
      completedAt: originToday?.completedAt ?? null,
    });
  }
  return result;
}

function missedOccurrencesBefore(
  schedule: WorkSchedule,
  persisted: WorkOccurrence[],
  date: string,
): number {
  if (schedule.scheduleType !== 'recurring' || schedule.scheduleDate >= date) return 0;
  const exceptions = new Set(
    persisted
      .filter((row) => row.scheduleId === schedule.id)
      .map((row) => row.occurrenceDate),
  );
  for (const row of persisted.filter((entry) => entry.scheduleId === schedule.id)) {
    if (row.effectiveDate !== row.occurrenceDate) exceptions.add(row.effectiveDate);
  }
  let missed = 0;
  for (const candidate of calendarDatesInRange(schedule.scheduleDate, addCalendarDays(date, -1))) {
    if (scheduleMatchesDate(schedule, candidate) && !exceptions.has(candidate)) missed += 1;
  }
  return missed;
}

/**
 * Server-side read model for a future Planner day view.
 *
 * It projects canonical Actions/Checklist items through schedules and sparse occurrence
 * overrides. It never creates or copies a task. Access is explicitly reduced to the
 * actor's organization, team memberships, and visible projects because the service-role
 * database client intentionally bypasses RLS.
 */
async function getPlannerProjectionForDates(
  actor: SchedulingActor,
  requestedDates: string[],
  options: ProjectionOptions = {},
): Promise<PlannerProjectionItem[]> {
  const dates = [...new Set(requestedDates)].sort();
  if (!dates.length) return [];
  for (const date of dates) assertCalendarDate(date, 'date');
  const maximumDate = dates[dates.length - 1];

  let schedulesQuery = supabaseAdmin
    .from('work_schedules')
    .select('*')
    .eq('organization_id', actor.organizationId)
    .is('archived_at', null)
    .lte('schedule_date', maximumDate);
  if (options.teamId) schedulesQuery = schedulesQuery.eq('team_id', options.teamId);

  const { data: scheduleRows, error: scheduleError } = await schedulesQuery;
  if (scheduleError) throw scheduleError;
  if (!scheduleRows?.length) return [];

  const schedules = scheduleRows.map(workScheduleFromRow);
  const scheduleIds = schedules.map((schedule) => schedule.id);
  const { data: occurrenceRows, error: occurrenceError } = await supabaseAdmin
    .from('work_occurrences')
    .select('*')
    .in('schedule_id', scheduleIds);
  if (occurrenceError) throw occurrenceError;
  const occurrences = (occurrenceRows ?? []).map(workOccurrenceFromRow);

  const orgAdmin = isOrgAdmin({
    id: actor.userId,
    organization_id: actor.organizationId,
    role: actor.role,
  });
  const visibleProjectById = new Map<string, any>();
  const allowedTeamIds = new Set<string>();
  for (const teamId of [...new Set(schedules.map((schedule) => schedule.teamId))]) {
    const membership = await teamMemberDb.getMembership(teamId, actor.userId);
    if (!membership && !orgAdmin) continue;
    allowedTeamIds.add(teamId);
    const visibleProjects = await projectDb.getVisibleForUser({
      organizationId: actor.organizationId,
      teamId,
      userId: actor.userId,
    });
    for (const project of visibleProjects) visibleProjectById.set(String(project.id), project);
  }

  const accessibleSchedules = schedules.filter((schedule) => allowedTeamIds.has(schedule.teamId));
  if (!accessibleSchedules.length) return [];
  const taskIds = [...new Set(accessibleSchedules.map((schedule) => schedule.source.taskId))];
  const { data: taskRows, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id,title,status,assignee_id,project_id,team_id,organization_id,checklist_blocks,updated_at')
    .eq('organization_id', actor.organizationId)
    .in('id', taskIds);
  if (taskError) throw taskError;
  const taskById = new Map((taskRows ?? []).map((task: any) => [String(task.id), task]));

  const result: PlannerProjectionItem[] = [];
  for (const schedule of accessibleSchedules) {
    const task: any = taskById.get(schedule.source.taskId);
    if (!task || String(task.team_id) !== schedule.teamId) continue;

    const projectId = task.project_id ? String(task.project_id) : null;
    const project = projectId ? visibleProjectById.get(projectId) ?? null : null;
    if (projectId && !project) continue;

    const checklistItemId = schedule.source.sourceType === 'checklist_item'
      ? schedule.source.checklistItemId
      : null;
    const checklistItem = checklistItemId
      ? extractChecklistItemsFromTipTap(task.checklist_blocks)
          .find((item) => item.id === checklistItemId) ?? null
      : null;
    // A removed checklist node is no longer executable; do not surface an orphan schedule.
    if (schedule.source.sourceType === 'checklist_item' && !checklistItem) continue;

    for (const candidateDate of dates) {
      for (const occurrence of occurrencesForDate(
        schedule,
        occurrences,
        candidateDate,
        Boolean(options.includeOverdueOneOff && dates.length === 1),
      )) {
      const sourceState = schedule.source.sourceType === 'action'
        ? actionState(task, project)
        : checklistItem?.checked
          ? 'completed'
          : 'pending';
      result.push({
        id: projectionId(schedule.id, occurrence.occurrenceDate),
        source: schedule.source,
        scheduleId: schedule.id,
        scheduleDate: schedule.scheduleDate,
        occurrenceDate: occurrence.occurrenceDate,
        effectiveDate: occurrence.effectiveDate,
        state: schedule.scheduleType === 'recurring' ? occurrence.state : sourceState,
        completedAt: schedule.scheduleType === 'recurring'
          ? occurrence.completedAt
          : sourceState === 'completed'
            ? schedule.source.sourceType === 'checklist_item'
              ? checklistItem?.completedAt ?? null
              : task.updated_at
                ? String(task.updated_at)
                : null
            : null,
        organizationId: schedule.organizationId,
        teamId: schedule.teamId,
        taskId: schedule.source.taskId,
        taskTitle: String(task.title),
        checklistItemId: checklistItem?.id ?? null,
        checklistItemText: checklistItem?.text ?? null,
        projectId,
        projectName: project?.name ? String(project.name) : null,
        assigneeId: checklistItem?.assigneeId ?? (task.assignee_id ? String(task.assignee_id) : null),
        scheduleTime: schedule.scheduleTime,
        timeZone: schedule.timeZone,
        isRecurring: schedule.scheduleType === 'recurring',
        recurrenceFrequency: schedule.recurrenceFrequency,
        recurrenceInterval: schedule.recurrenceInterval,
        recurrenceWeekdays: schedule.recurrenceWeekdays,
        endsOn: schedule.endsOn,
        reminderRules: schedule.reminderRules,
        missedCount: occurrence.effectiveDate === candidateDate
          ? missedOccurrencesBefore(schedule, occurrences, candidateDate)
          : 0,
      });
      }
    }
  }

  return result.sort((left, right) => {
    const leftTime = left.scheduleTime ?? '';
    const rightTime = right.scheduleTime ?? '';
    return leftTime.localeCompare(rightTime)
      || left.taskTitle.localeCompare(right.taskTitle)
      || left.id.localeCompare(right.id);
  });
}

export async function getPlannerProjectionForDate(
  actor: SchedulingActor,
  date: string,
  options: ProjectionOptions = {},
): Promise<PlannerProjectionItem[]> {
  return getPlannerProjectionForDates(actor, [date], options);
}

export async function getPlannerUpcomingProjection(
  actor: SchedulingActor,
  startDate: string,
  horizonDays: number,
  options: { teamId?: string },
): Promise<PlannerUpcomingProjection> {
  assertCalendarDate(startDate, 'startDate');
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 31) {
    throw new Error('horizonDays must be between 1 and 31');
  }
  const endDate = addCalendarDays(startDate, horizonDays - 1);
  const dates = calendarDatesInRange(startDate, endDate);
  const perDate = await getPlannerProjectionForDates(actor, dates, { teamId: options.teamId });
  const unique = new Map<string, PlannerProjectionItem>();
  for (const item of perDate) unique.set(item.id, item);
  return buildPlannerUpcomingProjection([...unique.values()], startDate, endDate);
}

export async function getPlannerTodayProjection(
  actor: SchedulingActor,
  date: string,
  options: { teamId?: string; timeZone: string },
): Promise<PlannerTodayProjection> {
  assertCalendarDate(date, 'date');
  if (!isIanaTimeZone(options.timeZone)) {
    throw new Error('timeZone must be a valid IANA time zone');
  }
  const items = await getPlannerProjectionForDate(actor, date, {
    teamId: options.teamId,
    includeOverdueOneOff: true,
  });
  return buildPlannerTodayProjection(items, date, options.timeZone);
}
