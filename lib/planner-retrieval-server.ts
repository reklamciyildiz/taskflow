import 'server-only';

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
  teamAccessVerified?: boolean;
  timings?: PlannerRetrievalTimings;
};

export type PlannerRetrievalTimings = {
  schedulesMs?: number;
  sourcesMs?: number;
  visibilityMs?: number;
  projectionMs?: number;
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
  const minimumDate = dates[0];
  const maximumDate = dates[dates.length - 1];

  const schedulesStartedAt = performance.now();
  let oneOffQuery = supabaseAdmin
    .from('work_schedules')
    .select('*')
    .eq('organization_id', actor.organizationId)
    .is('archived_at', null)
    .eq('schedule_type', 'one_off')
    .lte('schedule_date', maximumDate);
  if (!options.includeOverdueOneOff) oneOffQuery = oneOffQuery.gte('schedule_date', minimumDate);
  let recurringQuery = supabaseAdmin
    .from('work_schedules')
    .select('*')
    .eq('organization_id', actor.organizationId)
    .is('archived_at', null)
    .eq('schedule_type', 'recurring')
    .lte('schedule_date', maximumDate)
    .or(`ends_on.is.null,ends_on.gte.${minimumDate}`);
  if (options.teamId) {
    oneOffQuery = oneOffQuery.eq('team_id', options.teamId);
    recurringQuery = recurringQuery.eq('team_id', options.teamId);
  }

  const [oneOffResult, recurringResult] = await Promise.all([oneOffQuery, recurringQuery]);
  if (oneOffResult.error) throw oneOffResult.error;
  if (recurringResult.error) throw recurringResult.error;
  const scheduleRows = [...(oneOffResult.data ?? []), ...(recurringResult.data ?? [])];
  if (options.timings) options.timings.schedulesMs = performance.now() - schedulesStartedAt;
  if (!scheduleRows?.length) return [];

  const schedules = scheduleRows.map(workScheduleFromRow);
  const orgAdmin = isOrgAdmin({
    id: actor.userId,
    organization_id: actor.organizationId,
    role: actor.role,
  });
  const allowedTeamIds = new Set<string>();
  const scheduledTeamIds = [...new Set(schedules.map((schedule) => schedule.teamId))];
  if (options.teamAccessVerified && options.teamId) {
    allowedTeamIds.add(options.teamId);
  } else {
    const membershipResults = await Promise.all(scheduledTeamIds.map(async (teamId) => {
      if (orgAdmin) return { teamId, allowed: true };
      const { data, error } = await supabaseAdmin
        .from('team_members')
        .select('team_id')
        .eq('team_id', teamId)
        .eq('user_id', actor.userId)
        .maybeSingle();
      if (error) throw error;
      return { teamId, allowed: Boolean(data) };
    }));
    for (const result of membershipResults) if (result.allowed) allowedTeamIds.add(result.teamId);
  }

  const accessibleSchedules = schedules.filter((schedule) => allowedTeamIds.has(schedule.teamId));
  if (!accessibleSchedules.length) return [];
  const sourcesStartedAt = performance.now();
  const scheduleIds = accessibleSchedules.map((schedule) => schedule.id);
  const taskIds = [...new Set(accessibleSchedules.map((schedule) => schedule.source.taskId))];
  const [occurrenceResult, taskResult] = await Promise.all([
    supabaseAdmin
      .from('work_occurrences')
      .select('*')
      .in('schedule_id', scheduleIds)
      .or(`occurrence_date.lte.${maximumDate},and(effective_date.gte.${minimumDate},effective_date.lte.${maximumDate})`),
    supabaseAdmin
      .from('tasks')
      .select('id,title,status,assignee_id,project_id,team_id,organization_id,checklist_blocks,updated_at')
      .eq('organization_id', actor.organizationId)
      .in('id', taskIds),
  ]);
  if (occurrenceResult.error) throw occurrenceResult.error;
  const { data: taskRows, error: taskError } = taskResult;
  if (taskError) throw taskError;
  if (options.timings) options.timings.sourcesMs = performance.now() - sourcesStartedAt;
  const occurrences = (occurrenceResult.data ?? []).map(workOccurrenceFromRow);
  const taskById = new Map((taskRows ?? []).map((task: any) => [String(task.id), task]));

  const visibilityStartedAt = performance.now();
  const projectIds = [...new Set((taskRows ?? [])
    .map((task: any) => task.project_id ? String(task.project_id) : null)
    .filter((id: string | null): id is string => Boolean(id)))];
  const visibleProjectById = new Map<string, any>();
  if (projectIds.length) {
    const [projectResult, projectMemberResult] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('id,name,column_config,organization_id,team_id,visibility,created_by')
        .eq('organization_id', actor.organizationId)
        .in('id', projectIds),
      supabaseAdmin
        .from('project_members')
        .select('project_id')
        .in('project_id', projectIds)
        .eq('user_id', actor.userId),
    ]);
    if (projectResult.error) throw projectResult.error;
    if (projectMemberResult.error) throw projectMemberResult.error;
    const memberProjectIds = new Set((projectMemberResult.data ?? []).map((row: any) => String(row.project_id)));
    for (const project of projectResult.data ?? []) {
      const teamId = project.team_id ? String(project.team_id) : null;
      const visibility = String(project.visibility ?? 'team');
      const inTeamScope = teamId === null || allowedTeamIds.has(teamId);
      const visible = inTeamScope && (
        visibility === 'team'
        || visibility === 'restricted' && memberProjectIds.has(String(project.id))
        || visibility === 'private' && (
          String(project.created_by) === actor.userId
          || memberProjectIds.has(String(project.id))
        )
      );
      if (visible) visibleProjectById.set(String(project.id), project);
    }
  }
  if (options.timings) options.timings.visibilityMs = performance.now() - visibilityStartedAt;

  const projectionStartedAt = performance.now();
  const occurrencesByScheduleId = new Map<string, WorkOccurrence[]>();
  for (const occurrence of occurrences) {
    const current = occurrencesByScheduleId.get(occurrence.scheduleId) ?? [];
    current.push(occurrence);
    occurrencesByScheduleId.set(occurrence.scheduleId, current);
  }
  const checklistByTaskId = new Map<string, Map<string, ReturnType<typeof extractChecklistItemsFromTipTap>[number]>>();
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
    let checklistItem = null;
    if (checklistItemId) {
      let itemById = checklistByTaskId.get(schedule.source.taskId);
      if (!itemById) {
        itemById = new Map(extractChecklistItemsFromTipTap(task.checklist_blocks).map((item) => [item.id, item]));
        checklistByTaskId.set(schedule.source.taskId, itemById);
      }
      checklistItem = itemById.get(checklistItemId) ?? null;
    }
    // A removed checklist node is no longer executable; do not surface an orphan schedule.
    if (schedule.source.sourceType === 'checklist_item' && !checklistItem) continue;

    for (const candidateDate of dates) {
      const scheduleOccurrences = occurrencesByScheduleId.get(schedule.id) ?? [];
      for (const occurrence of occurrencesForDate(
        schedule,
        scheduleOccurrences,
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
          ? missedOccurrencesBefore(schedule, scheduleOccurrences, candidateDate)
          : 0,
      });
      }
    }
  }

  if (options.timings) options.timings.projectionMs = performance.now() - projectionStartedAt;

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
  options: { teamId?: string; teamAccessVerified?: boolean; timings?: PlannerRetrievalTimings },
): Promise<PlannerUpcomingProjection> {
  assertCalendarDate(startDate, 'startDate');
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 31) {
    throw new Error('horizonDays must be between 1 and 31');
  }
  const endDate = addCalendarDays(startDate, horizonDays - 1);
  const dates = calendarDatesInRange(startDate, endDate);
  const perDate = await getPlannerProjectionForDates(actor, dates, {
    teamId: options.teamId,
    teamAccessVerified: options.teamAccessVerified,
    timings: options.timings,
  });
  const unique = new Map<string, PlannerProjectionItem>();
  for (const item of perDate) unique.set(item.id, item);
  return buildPlannerUpcomingProjection([...unique.values()], startDate, endDate);
}

export async function getPlannerTodayProjection(
  actor: SchedulingActor,
  date: string,
  options: {
    teamId?: string;
    timeZone: string;
    teamAccessVerified?: boolean;
    timings?: PlannerRetrievalTimings;
  },
): Promise<PlannerTodayProjection> {
  assertCalendarDate(date, 'date');
  if (!isIanaTimeZone(options.timeZone)) {
    throw new Error('timeZone must be a valid IANA time zone');
  }
  const items = await getPlannerProjectionForDate(actor, date, {
    teamId: options.teamId,
    includeOverdueOneOff: true,
    teamAccessVerified: options.teamAccessVerified,
    timings: options.timings,
  });
  return buildPlannerTodayProjection(items, date, options.timeZone);
}
