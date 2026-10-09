import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import {
  FALLBACK_BOARD_COLUMNS,
  isTerminalBoardColumn,
  parseColumnConfigFromJson,
} from '@/lib/types';
import {
  createWorkSchedule,
  removeWorkSchedule,
  resolveScheduleForSource,
  updateWorkSchedule,
  type SchedulingActor,
} from '@/lib/work-schedule-server';
import {
  legacyDueValueToSchedule,
  reminderInstantsFromRules,
  reminderRulesFromInstants,
  scheduleDueInstantIso,
  scheduleToLegacyDueValue,
} from '@/lib/scheduling-runtime';
import {
  assertCalendarDate,
  scheduleMatchesDate,
  SchedulingValidationError,
  workOccurrenceFromRow,
  workScheduleFromRow,
  type WorkSchedule,
  type WorkSource,
} from '@/lib/scheduling-domain';

export type ScheduleCommand = {
  dueDate?: string | null;
  reminders?: string[] | null;
};

export type ScheduleSyncResult = {
  schedule: WorkSchedule | null;
  changed: boolean;
};

export type ChecklistScheduleCommand = {
  id: string;
  dueDate: string | null;
  reminders: string[];
};

function chunks<T>(values: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function getUserSchedulingTimeZone(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('time_zone')
    .eq('user_id', userId)
    .maybeSingle();
  const timeZone = typeof (data as any)?.time_zone === 'string'
    ? String((data as any).time_zone).trim()
    : '';
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
      return timeZone;
    } catch {
      // Invalid legacy preference: preserve instants in UTC instead of failing a due-date edit.
    }
  }
  return 'UTC';
}

function normalizedReminderInstants(values: string[] | null | undefined): string[] {
  return reminderInstantsFromRules(reminderRulesFromInstants(values));
}

export async function syncOneOffScheduleCommand(
  actor: SchedulingActor,
  source: WorkSource,
  command: ScheduleCommand,
): Promise<ScheduleSyncResult> {
  const existing = await resolveScheduleForSource(actor, source);
  const currentDue = existing ? scheduleToLegacyDueValue(existing) : null;
  const currentReminders = existing ? reminderInstantsFromRules(existing.reminderRules) : [];

  const dueDate = command.dueDate === undefined
    ? currentDue
    : typeof command.dueDate === 'string' && command.dueDate.trim()
      ? command.dueDate.trim()
      : null;
  const reminders = command.reminders === undefined
    ? currentReminders
    : normalizedReminderInstants(command.reminders);

  if (!dueDate) {
    if (reminders.length > 0) throw new SchedulingValidationError('A reminder requires a due date');
    if (!existing) return { schedule: null, changed: false };
    await removeWorkSchedule(actor, existing.id);
    return { schedule: null, changed: true };
  }

  const timeZone = await getUserSchedulingTimeZone(actor.userId);
  const due = legacyDueValueToSchedule(dueDate, timeZone);
  const reminderRules = reminderRulesFromInstants(
    reminders,
    scheduleDueInstantIso(due, timeZone),
  );
  const fieldsMatch = existing
    && existing.scheduleDate === due.scheduleDate
    && existing.scheduleTime === due.scheduleTime
    && existing.timeZone === due.timeZone
    && JSON.stringify(reminderInstantsFromRules(existing.reminderRules)) === JSON.stringify(reminders);

  // An unchanged compatibility payload must never collapse a recurring schedule to one-off.
  if (fieldsMatch) return { schedule: existing, changed: false };

  if (!existing) {
    const schedule = await createWorkSchedule(actor, {
      source,
      scheduleType: 'one_off',
      scheduleDate: due.scheduleDate,
      scheduleTime: due.scheduleTime,
      timeZone: due.timeZone,
      reminderRules,
    });
    return { schedule, changed: true };
  }

  const schedule = await updateWorkSchedule(actor, existing.id, {
    scheduleType: 'one_off',
    scheduleDate: due.scheduleDate,
    scheduleTime: due.scheduleTime,
    timeZone: due.timeZone,
    reminderRules,
  });
  return { schedule, changed: true };
}

export async function syncChecklistScheduleCommands(
  actor: SchedulingActor,
  taskId: string,
  items: ChecklistScheduleCommand[],
): Promise<string[]> {
  const seen = new Set<string>();
  const changed: string[] = [];
  const timeZone = await getUserSchedulingTimeZone(actor.userId);
  const activeSchedules = await activeSchedulesForTaskIds([taskId]);
  const scheduleByItemId = new Map<string, WorkSchedule>();
  for (const schedule of activeSchedules) {
    if (schedule.source.sourceType === 'checklist_item') {
      scheduleByItemId.set(schedule.source.checklistItemId, schedule);
    }
  }
  for (const item of items) {
    if (!item.id || seen.has(item.id)) {
      throw new SchedulingValidationError('Checklist scheduling requires unique stable item IDs');
    }
    seen.add(item.id);
    const existing = scheduleByItemId.get(item.id) ?? null;
    const reminders = normalizedReminderInstants(item.reminders);
    if (!existing && !item.dueDate && reminders.length === 0) continue;
    if (existing && item.dueDate) {
      const due = legacyDueValueToSchedule(item.dueDate, timeZone);
      const fieldsMatch = existing.scheduleDate === due.scheduleDate
        && existing.scheduleTime === due.scheduleTime
        && existing.timeZone === due.timeZone
        && JSON.stringify(reminderInstantsFromRules(existing.reminderRules)) === JSON.stringify(reminders);
      if (fieldsMatch) continue;
    }
    const result = await syncOneOffScheduleCommand(
      actor,
      { sourceType: 'checklist_item', taskId, checklistItemId: item.id },
      { dueDate: item.dueDate, reminders },
    );
    if (result.changed) changed.push(item.id);
  }
  return changed;
}

async function activeSchedulesForTaskIds(taskIds: string[]): Promise<WorkSchedule[]> {
  if (!taskIds.length) return [];
  const rows: any[] = [];
  for (const batch of chunks(taskIds)) {
    const { data, error } = await supabaseAdmin
      .from('work_schedules')
      .select('*')
      .in('task_id', batch)
      .is('archived_at', null);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows.map(workScheduleFromRow);
}

function mapChecklistScheduling(
  value: any,
  schedulesByItemId: Map<string, WorkSchedule>,
  mode: 'hydrate' | 'strip',
): any {
  if (Array.isArray(value)) {
    return value.map((entry) => mapChecklistScheduling(entry, schedulesByItemId, mode));
  }
  if (!value || typeof value !== 'object') return value;

  const next: Record<string, any> = { ...value };
  if (value.type === 'taskItem') {
    const attrs = value.attrs && typeof value.attrs === 'object' ? value.attrs : {};
    const id = typeof attrs.id === 'string' ? attrs.id : '';
    const schedule = id ? schedulesByItemId.get(id) : undefined;
    next.attrs = {
      ...attrs,
      dueDate: mode === 'hydrate' && schedule ? scheduleToLegacyDueValue(schedule) : null,
      reminders: mode === 'hydrate' && schedule
        ? reminderInstantsFromRules(schedule.reminderRules)
        : [],
      schedule: mode === 'hydrate' && schedule ? schedule : null,
    };
  }
  if (Array.isArray(value.content)) {
    next.content = value.content.map((entry: any) => mapChecklistScheduling(entry, schedulesByItemId, mode));
  }
  return next;
}

export function stripChecklistSchedulingMetadata(checklistBlocks: any): any {
  return mapChecklistScheduling(checklistBlocks, new Map(), 'strip');
}

export async function hydrateTasksWithCanonicalSchedules<T extends Record<string, any>>(
  tasks: T[],
): Promise<T[]> {
  if (!tasks.length) return [];
  const schedules = await activeSchedulesForTaskIds(tasks.map((task) => String(task.id)));
  const schedulesByTask = new Map<string, WorkSchedule[]>();
  for (const schedule of schedules) {
    const list = schedulesByTask.get(schedule.source.taskId) ?? [];
    list.push(schedule);
    schedulesByTask.set(schedule.source.taskId, list);
  }

  return tasks.map((task) => {
    const taskSchedules = schedulesByTask.get(String(task.id)) ?? [];
    const actionSchedule = taskSchedules.find((schedule) => schedule.source.sourceType === 'action') ?? null;
    const checklistSchedules = new Map<string, WorkSchedule>();
    for (const schedule of taskSchedules) {
      if (schedule.source.sourceType === 'checklist_item') {
        checklistSchedules.set(schedule.source.checklistItemId, schedule);
      }
    }
    return {
      ...task,
      due_date: actionSchedule ? scheduleToLegacyDueValue(actionSchedule) : null,
      reminders: actionSchedule ? reminderInstantsFromRules(actionSchedule.reminderRules) : [],
      work_schedule: actionSchedule,
      checklist_blocks: mapChecklistScheduling(task.checklist_blocks, checklistSchedules, 'hydrate'),
    };
  });
}

export async function hydrateTaskWithCanonicalSchedules<T extends Record<string, any>>(
  task: T,
): Promise<T> {
  return (await hydrateTasksWithCanonicalSchedules([task]))[0];
}

export type ScheduledWorkRuntimeItem = {
  schedule: WorkSchedule;
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  organizationId: string;
  teamId: string;
  sourceType: 'action' | 'checklist_item';
  checklistItemId: string | null;
  checklistItemText: string | null;
  recipientId: string | null;
  recipientTimeZone: string;
  dueDate: string;
  reminderInstants: string[];
  occurrenceDate: string;
};

/** Canonical runtime projection for the existing due/reminder processors. */
async function listActiveScheduledWorkTemplates(
  includeRecurring: boolean,
): Promise<ScheduledWorkRuntimeItem[]> {
  let scheduleQuery = supabaseAdmin
    .from('work_schedules')
    .select('*')
    .is('archived_at', null);
  if (!includeRecurring) scheduleQuery = scheduleQuery.eq('schedule_type', 'one_off');
  const { data: scheduleRows, error: scheduleError } = await scheduleQuery;
  if (scheduleError) throw scheduleError;
  if (!scheduleRows?.length) return [];
  const schedules = scheduleRows.map(workScheduleFromRow);

  const taskIds = [...new Set(schedules.map((schedule) => schedule.source.taskId))];
  const taskRows: any[] = [];
  for (const batch of chunks(taskIds)) {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('id,title,status,assignee_id,created_by,checklist_blocks,project_id,organization_id,team_id')
      .in('id', batch);
    if (error) throw error;
    taskRows.push(...(data ?? []));
  }

  const projectIds = [...new Set(taskRows
    .map((task: any) => task.project_id ? String(task.project_id) : null)
    .filter((id: string | null): id is string => Boolean(id)))];
  const projectById = new Map<string, any>();
  for (const batch of chunks(projectIds)) {
    const { data: projects, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id,column_config')
      .in('id', batch);
    if (projectError) throw projectError;
    for (const project of projects ?? []) projectById.set(String(project.id), project);
  }

  const taskById = new Map(taskRows.map((task: any) => [String(task.id), task]));
  const result: ScheduledWorkRuntimeItem[] = [];
  for (const schedule of schedules) {
    const task: any = taskById.get(schedule.source.taskId);
    if (!task) continue;
    const projectId = task.project_id ? String(task.project_id) : null;
    const project = projectId ? projectById.get(projectId) : null;
    const columns = project
      ? parseColumnConfigFromJson(project.column_config)
      : FALLBACK_BOARD_COLUMNS;
    if (
      schedule.scheduleType === 'one_off'
      && isTerminalBoardColumn(String(task.status), columns.length ? columns : FALLBACK_BOARD_COLUMNS)
    ) {
      continue;
    }

    const taskAssignee = task.assignee_id ? String(task.assignee_id) : null;
    const creator = task.created_by ? String(task.created_by) : null;
    let checklistItemId: string | null = null;
    let checklistItemText: string | null = null;
    let recipientId = taskAssignee || creator;
    if (schedule.source.sourceType === 'checklist_item') {
      const sourceChecklistItemId = schedule.source.checklistItemId;
      const item = extractChecklistItemsFromTipTap(task.checklist_blocks)
        .find((entry) => entry.id === sourceChecklistItemId);
      if (!item || (schedule.scheduleType === 'one_off' && item.checked)) continue;
      checklistItemId = item.id;
      checklistItemText = item.text.trim();
      if (!checklistItemText) continue;
      recipientId = item.assigneeId || taskAssignee || creator;
    }

    result.push({
      schedule,
      taskId: String(task.id),
      taskTitle: String(task.title || 'Action'),
      projectId,
      organizationId: String(task.organization_id),
      teamId: String(task.team_id),
      sourceType: schedule.source.sourceType,
      checklistItemId,
      checklistItemText,
      recipientId,
      recipientTimeZone: 'UTC',
      dueDate: schedule.scheduleDate,
      reminderInstants: reminderInstantsFromRules(schedule.reminderRules),
      occurrenceDate: schedule.scheduleDate,
    });
  }

  const recipientIds = [...new Set(result
    .map((item) => item.recipientId)
    .filter((id): id is string => Boolean(id)))];
  const timeZoneByUserId = new Map<string, string>();
  for (const batch of chunks(recipientIds)) {
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('user_id,time_zone')
      .in('user_id', batch);
    if (settingsError) throw settingsError;
    for (const setting of settings ?? []) {
      const candidate = typeof (setting as any).time_zone === 'string'
        ? String((setting as any).time_zone).trim()
        : '';
      if (!candidate) continue;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
        timeZoneByUserId.set(String((setting as any).user_id), candidate);
      } catch {
        // Invalid legacy preference falls back to UTC, matching schedule command behavior.
      }
    }
  }
  for (const item of result) {
    item.recipientTimeZone = item.recipientId
      ? timeZoneByUserId.get(item.recipientId) ?? 'UTC'
      : 'UTC';
  }
  return result;
}

export async function listActiveOneOffScheduledWork(): Promise<ScheduledWorkRuntimeItem[]> {
  return listActiveScheduledWorkTemplates(false);
}

/**
 * Resolve actionable reminder targets without materializing pending occurrences.
 * Persisted completion/skip/reschedule exceptions are merged by occurrence identity.
 */
export async function listActiveScheduledWorkForDates(
  dates: string[],
): Promise<ScheduledWorkRuntimeItem[]> {
  const uniqueDates = [...new Set(dates)];
  for (const date of uniqueDates) assertCalendarDate(date, 'reminder date');
  const templates = await listActiveScheduledWorkTemplates(true);
  const recurring = templates.filter((item) => item.schedule.scheduleType === 'recurring');
  if (!recurring.length) return templates;

  const scheduleIds = recurring.map((item) => item.schedule.id);
  const { data: rows, error } = await supabaseAdmin
    .from('work_occurrences')
    .select('*')
    .in('schedule_id', scheduleIds);
  if (error) throw error;
  const occurrences = (rows ?? []).map(workOccurrenceFromRow);
  // Keep every one-off template: migrated absolute reminders may intentionally be
  // far away from the due date. Preset rules simply resolve outside this tick window.
  const result = templates.filter((item) => item.schedule.scheduleType === 'one_off');

  for (const template of recurring) {
    const scheduleRows = occurrences.filter((row) => row.scheduleId === template.schedule.id);
    for (const date of uniqueDates) {
      const origin = scheduleRows.find((row) => row.occurrenceDate === date);
      const movedHere = scheduleRows.filter(
        (row) => row.occurrenceDate !== date && row.effectiveDate === date,
      );
      if (
        movedHere.length === 0
        &&
        scheduleMatchesDate(template.schedule, date)
        && (!origin || origin.effectiveDate === date)
        && origin?.state !== 'completed'
        && origin?.state !== 'skipped'
      ) {
        result.push({
          ...template,
          dueDate: date,
          occurrenceDate: date,
        });
      }
      for (const moved of movedHere) {
        if (
          moved.state === 'pending'
        ) {
          result.push({
            ...template,
            dueDate: date,
            occurrenceDate: moved.occurrenceDate,
          });
        }
      }
    }
  }
  return result;
}
