import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { canMutateTeamTasks, isOrgAdmin } from '@/lib/server-authz';
import { extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import {
  SchedulingValidationError,
  assertCalendarDate,
  implicitOccurrenceState,
  normalizeWorkScheduleInput,
  scheduleMatchesDate,
  workOccurrenceFromRow,
  workScheduleFromRow,
  type WorkOccurrence,
  type WorkOccurrenceState,
  type WorkSchedule,
  type WorkScheduleInput,
  type WorkSchedulePatch,
  type WorkSource,
} from '@/lib/scheduling-domain';

export type SchedulingActor = {
  userId: string;
  organizationId: string;
  role?: string | null;
};

export type ScheduleMutationTimings = {
  sourceAccessMs?: number;
  lookupMs?: number;
  writeMs?: number;
};

export class SchedulingAccessError extends Error {
  readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT';

  constructor(code: SchedulingAccessError['code'], message: string) {
    super(message);
    this.name = 'SchedulingAccessError';
    this.code = code;
  }
}

type SourceAccess = { task: any; checklistItem: ReturnType<typeof extractChecklistItemsFromTipTap>[number] | null };

async function requireSourceAccess(
  actor: SchedulingActor,
  source: WorkSource,
  mutate: boolean,
): Promise<SourceAccess> {
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id,organization_id,team_id,project_id,checklist_blocks')
    .eq('id', source.taskId)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!task || String((task as any).organization_id) !== actor.organizationId) {
    throw new SchedulingAccessError('NOT_FOUND', 'Work source not found');
  }

  const orgAdmin = isOrgAdmin({ id: actor.userId, organization_id: actor.organizationId, role: actor.role });
  const teamId = String((task as any).team_id);
  const projectId = (task as any).project_id ? String((task as any).project_id) : null;
  const [membershipResult, projectResult, projectMembershipResult] = await Promise.all([
    orgAdmin
      ? Promise.resolve({ data: { role: 'admin' }, error: null })
      : supabaseAdmin
          .from('team_members')
          .select('role')
          .eq('team_id', teamId)
          .eq('user_id', actor.userId)
          .maybeSingle(),
    projectId
      ? supabaseAdmin
          .from('projects')
          .select('id,organization_id,team_id,visibility,created_by')
          .eq('id', projectId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    projectId
      ? supabaseAdmin
          .from('project_members')
          .select('project_id')
          .eq('project_id', projectId)
          .eq('user_id', actor.userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (membershipResult.error) throw membershipResult.error;
  if (projectResult.error) throw projectResult.error;
  if (projectMembershipResult.error) throw projectMembershipResult.error;
  const membership = membershipResult.data;
  if (!membership && !orgAdmin) {
    throw new SchedulingAccessError('FORBIDDEN', 'Work source is outside the actor team scope');
  }
  if (mutate && !canMutateTeamTasks(membership, orgAdmin)) {
    throw new SchedulingAccessError('FORBIDDEN', 'Read-only team members cannot change schedules');
  }

  if (projectId) {
    const project: any = projectResult.data;
    const projectMember = Boolean(projectMembershipResult.data);
    const visibility = String(project?.visibility ?? 'team');
    const inScope = project
      && String(project.organization_id) === actor.organizationId
      && (!project.team_id || String(project.team_id) === teamId);
    const visible = inScope && (
      visibility === 'team'
      || visibility === 'restricted' && projectMember
      || visibility === 'private' && (String(project.created_by) === actor.userId || projectMember)
    );
    if (!visible) {
      throw new SchedulingAccessError('NOT_FOUND', 'Work source not found');
    }
  }

  if (source.sourceType === 'action') return { task, checklistItem: null };
  const matches = extractChecklistItemsFromTipTap((task as any).checklist_blocks)
    .filter((item) => item.id === source.checklistItemId);
  if (matches.length !== 1) {
    throw new SchedulingAccessError('NOT_FOUND', 'Checklist item not found');
  }
  return { task, checklistItem: matches[0] };
}

async function scheduleRowById(id: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from('work_schedules')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function sourceFromScheduleRow(row: any): WorkSource {
  return row.checklist_item_id
    ? {
        sourceType: 'checklist_item',
        taskId: String(row.task_id),
        checklistItemId: String(row.checklist_item_id),
      }
    : { sourceType: 'action', taskId: String(row.task_id) };
}

async function requireScheduleAccess(
  actor: SchedulingActor,
  scheduleId: string,
  mutate: boolean,
): Promise<{ row: any; schedule: WorkSchedule }> {
  const row = await scheduleRowById(scheduleId);
  if (!row || String(row.organization_id) !== actor.organizationId) {
    throw new SchedulingAccessError('NOT_FOUND', 'Schedule not found');
  }
  await requireSourceAccess(actor, sourceFromScheduleRow(row), mutate);
  return { row, schedule: workScheduleFromRow(row) };
}

function scheduleInsert(input: WorkScheduleInput, task: any) {
  const normalized = normalizeWorkScheduleInput(input);
  return {
    organization_id: String((task as any).organization_id),
    team_id: String((task as any).team_id),
    task_id: normalized.source.taskId,
    checklist_item_id:
      normalized.source.sourceType === 'checklist_item'
        ? normalized.source.checklistItemId
        : null,
    schedule_type: normalized.scheduleType,
    schedule_date: normalized.scheduleDate,
    schedule_time: normalized.scheduleTime,
    time_zone: normalized.timeZone,
    recurrence_frequency: normalized.recurrenceFrequency,
    recurrence_interval: normalized.recurrenceInterval,
    recurrence_weekdays: normalized.recurrenceWeekdays,
    ends_on: normalized.endsOn,
    reminder_rules: normalized.reminderRules,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

async function activeScheduleRowForSource(
  actor: SchedulingActor,
  source: WorkSource,
): Promise<any | null> {
  let query = supabaseAdmin
    .from('work_schedules')
    .select('*')
    .eq('organization_id', actor.organizationId)
    .eq('task_id', source.taskId)
    .is('archived_at', null);
  query = source.sourceType === 'action'
    ? query.is('checklist_item_id', null)
    : query.eq('checklist_item_id', source.checklistItemId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Single-pass source authorization + create/update for interactive Schedule UX. */
export async function saveWorkScheduleForSource(
  actor: SchedulingActor,
  input: WorkScheduleInput,
  timings?: ScheduleMutationTimings,
): Promise<WorkSchedule> {
  const normalized = normalizeWorkScheduleInput(input);
  const sourceStartedAt = performance.now();
  const access = await requireSourceAccess(actor, normalized.source, true);
  if (timings) timings.sourceAccessMs = performance.now() - sourceStartedAt;
  const lookupStartedAt = performance.now();
  const existing = await activeScheduleRowForSource(actor, normalized.source);
  if (timings) timings.lookupMs = performance.now() - lookupStartedAt;
  const payload = scheduleInsert(normalized, access.task);
  const mutation = existing
    ? supabaseAdmin
        .from('work_schedules')
        .update(payload)
        .eq('id', existing.id)
        .eq('organization_id', actor.organizationId)
        .is('archived_at', null)
    : supabaseAdmin.from('work_schedules').insert(payload);
  const writeStartedAt = performance.now();
  const { data, error } = await mutation.select('*').single();
  if (timings) timings.writeMs = performance.now() - writeStartedAt;
  if (error) {
    if (isUniqueViolation(error)) {
      throw new SchedulingAccessError('CONFLICT', 'This work source already has an active schedule');
    }
    throw error;
  }
  return workScheduleFromRow(data);
}

/** Archives a source schedule without repeating source and schedule authorization. */
export async function removeWorkScheduleForSource(
  actor: SchedulingActor,
  source: WorkSource,
  timings?: ScheduleMutationTimings,
): Promise<void> {
  const sourceStartedAt = performance.now();
  await requireSourceAccess(actor, source, true);
  if (timings) timings.sourceAccessMs = performance.now() - sourceStartedAt;
  const lookupStartedAt = performance.now();
  const existing = await activeScheduleRowForSource(actor, source);
  if (timings) timings.lookupMs = performance.now() - lookupStartedAt;
  if (!existing) return;
  const writeStartedAt = performance.now();
  const { error } = await supabaseAdmin
    .from('work_schedules')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('organization_id', actor.organizationId)
    .is('archived_at', null);
  if (timings) timings.writeMs = performance.now() - writeStartedAt;
  if (error) throw error;
}

export async function createWorkSchedule(
  actor: SchedulingActor,
  input: WorkScheduleInput,
): Promise<WorkSchedule> {
  const normalized = normalizeWorkScheduleInput(input);
  const access = await requireSourceAccess(actor, normalized.source, true);
  const { data, error } = await supabaseAdmin
    .from('work_schedules')
    .insert(scheduleInsert(normalized, access.task))
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      throw new SchedulingAccessError('CONFLICT', 'This work source already has an active schedule');
    }
    throw error;
  }
  return workScheduleFromRow(data);
}

export async function updateWorkSchedule(
  actor: SchedulingActor,
  scheduleId: string,
  patch: WorkSchedulePatch,
): Promise<WorkSchedule> {
  const { row, schedule } = await requireScheduleAccess(actor, scheduleId, true);
  if (schedule.archivedAt) throw new SchedulingAccessError('CONFLICT', 'Archived schedules cannot be changed');

  const nextScheduleType = patch.scheduleType ?? schedule.scheduleType;
  const convertingToOneOff = schedule.scheduleType === 'recurring' && nextScheduleType === 'one_off';

  const normalized = normalizeWorkScheduleInput({
    source: schedule.source,
    scheduleType: nextScheduleType,
    scheduleDate: patch.scheduleDate ?? schedule.scheduleDate,
    scheduleTime: patch.scheduleTime !== undefined ? patch.scheduleTime : schedule.scheduleTime,
    timeZone: patch.timeZone !== undefined ? patch.timeZone : schedule.timeZone,
    recurrenceFrequency: convertingToOneOff
      ? null
      : patch.recurrenceFrequency !== undefined
        ? patch.recurrenceFrequency
        : schedule.recurrenceFrequency,
    recurrenceInterval: convertingToOneOff
      ? 1
      : patch.recurrenceInterval ?? schedule.recurrenceInterval,
    recurrenceWeekdays: convertingToOneOff
      ? []
      : patch.recurrenceWeekdays ?? schedule.recurrenceWeekdays,
    endsOn: convertingToOneOff
      ? null
      : patch.endsOn !== undefined ? patch.endsOn : schedule.endsOn,
    reminderRules: patch.reminderRules ?? schedule.reminderRules,
  });

  const { data, error } = await supabaseAdmin
    .from('work_schedules')
    .update(scheduleInsert(normalized, {
      organization_id: row.organization_id,
      team_id: row.team_id,
    }))
    .eq('id', scheduleId)
    .eq('organization_id', actor.organizationId)
    .is('archived_at', null)
    .select('*')
    .single();
  if (error) throw error;
  return workScheduleFromRow(data);
}

export async function removeWorkSchedule(
  actor: SchedulingActor,
  scheduleId: string,
): Promise<void> {
  await requireScheduleAccess(actor, scheduleId, true);
  const { error } = await supabaseAdmin
    .from('work_schedules')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', scheduleId)
    .eq('organization_id', actor.organizationId)
    .is('archived_at', null);
  if (error) throw error;
}

export async function resolveScheduleForSource(
  actor: SchedulingActor,
  source: WorkSource,
): Promise<WorkSchedule | null> {
  await requireSourceAccess(actor, source, false);
  const data = await activeScheduleRowForSource(actor, source);
  return data ? workScheduleFromRow(data) : null;
}

export async function getOccurrenceState(
  actor: SchedulingActor,
  scheduleId: string,
  occurrenceDate: string,
): Promise<{ state: WorkOccurrenceState; occurrence: WorkOccurrence | null }> {
  assertCalendarDate(occurrenceDate, 'occurrenceDate');
  const { schedule } = await requireScheduleAccess(actor, scheduleId, false);
  if (schedule.scheduleType !== 'recurring') {
    throw new SchedulingValidationError('Only recurring schedules have occurrences');
  }
  const { data: movedHere, error: movedError } = await supabaseAdmin
    .from('work_occurrences')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('effective_date', occurrenceDate)
    .neq('occurrence_date', occurrenceDate)
    .limit(1)
    .maybeSingle();
  if (movedError) throw movedError;
  if (movedHere) {
    const occurrence = workOccurrenceFromRow(movedHere);
    return { state: occurrence.state, occurrence };
  }
  if (!scheduleMatchesDate(schedule, occurrenceDate)) {
    throw new SchedulingValidationError('occurrenceDate is not generated by this recurring schedule');
  }
  const { data, error } = await supabaseAdmin
    .from('work_occurrences')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle();
  if (error) throw error;
  const occurrence = data ? workOccurrenceFromRow(data) : null;
  return { state: implicitOccurrenceState(schedule, occurrenceDate, occurrence) ?? 'pending', occurrence };
}

async function setOccurrenceState(
  actor: SchedulingActor,
  scheduleId: string,
  occurrenceDate: string,
  state: Exclude<WorkOccurrenceState, 'pending'>,
): Promise<WorkOccurrence> {
  assertCalendarDate(occurrenceDate, 'occurrenceDate');
  const { schedule } = await requireScheduleAccess(actor, scheduleId, true);
  if (schedule.archivedAt || schedule.scheduleType !== 'recurring') {
    throw new SchedulingValidationError('Only active recurring schedules have occurrences');
  }
  if (!scheduleMatchesDate(schedule, occurrenceDate)) {
    throw new SchedulingValidationError('occurrenceDate is not generated by this recurring schedule');
  }

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('work_occurrences')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    schedule_id: scheduleId,
    occurrence_date: occurrenceDate,
    effective_date: existing?.effective_date ?? occurrenceDate,
    state,
    completed_at: state === 'completed' ? now : null,
    rescheduled_at: existing?.rescheduled_at ?? null,
  };
  const { data, error } = await supabaseAdmin
    .from('work_occurrences')
    .upsert(payload, { onConflict: 'schedule_id,occurrence_date' })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      throw new SchedulingAccessError(
        'CONFLICT',
        'Another occurrence of this work is already scheduled for that date',
      );
    }
    throw error;
  }
  return workOccurrenceFromRow(data);
}

export function completeOccurrence(
  actor: SchedulingActor,
  scheduleId: string,
  occurrenceDate: string,
): Promise<WorkOccurrence> {
  return setOccurrenceState(actor, scheduleId, occurrenceDate, 'completed');
}

export function skipOccurrence(
  actor: SchedulingActor,
  scheduleId: string,
  occurrenceDate: string,
): Promise<WorkOccurrence> {
  return setOccurrenceState(actor, scheduleId, occurrenceDate, 'skipped');
}

export async function rescheduleOccurrence(
  actor: SchedulingActor,
  scheduleId: string,
  occurrenceDate: string,
  effectiveDate: string,
): Promise<WorkOccurrence | null> {
  assertCalendarDate(occurrenceDate, 'occurrenceDate');
  assertCalendarDate(effectiveDate, 'effectiveDate');
  const { schedule } = await requireScheduleAccess(actor, scheduleId, true);
  if (schedule.archivedAt || schedule.scheduleType !== 'recurring') {
    throw new SchedulingValidationError('Only active recurring schedules have occurrences');
  }
  if (!scheduleMatchesDate(schedule, occurrenceDate)) {
    throw new SchedulingValidationError('occurrenceDate is not generated by this recurring schedule');
  }

  if (effectiveDate !== occurrenceDate) {
    const { data: collision, error: collisionError } = await supabaseAdmin
      .from('work_occurrences')
      .select('id,occurrence_date')
      .eq('schedule_id', scheduleId)
      .eq('effective_date', effectiveDate)
      .neq('occurrence_date', occurrenceDate)
      .limit(1)
      .maybeSingle();
    if (collisionError) throw collisionError;
    if (collision) {
      throw new SchedulingAccessError(
        'CONFLICT',
        'Another occurrence of this work is already rescheduled to that date',
      );
    }
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('work_occurrences')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle();
  if (existingError) throw existingError;

  if (effectiveDate === occurrenceDate) {
    if (!existing) return null;
    if (existing.state === 'pending') {
      const { error } = await supabaseAdmin
        .from('work_occurrences')
        .delete()
        .eq('id', existing.id)
        .eq('schedule_id', scheduleId);
      if (error) throw error;
      return null;
    }
  }

  const now = new Date().toISOString();
  const state = existing?.state ?? 'pending';
  const payload = {
    schedule_id: scheduleId,
    occurrence_date: occurrenceDate,
    effective_date: effectiveDate,
    state,
    completed_at: state === 'completed' ? existing?.completed_at ?? now : null,
    rescheduled_at: effectiveDate === occurrenceDate ? null : now,
  };
  const { data, error } = await supabaseAdmin
    .from('work_occurrences')
    .upsert(payload, { onConflict: 'schedule_id,occurrence_date' })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      throw new SchedulingAccessError(
        'CONFLICT',
        'Another occurrence of this work is already scheduled for that date',
      );
    }
    throw error;
  }
  return workOccurrenceFromRow(data);
}

export async function uncompleteOccurrence(
  actor: SchedulingActor,
  scheduleId: string,
  occurrenceDate: string,
): Promise<WorkOccurrence | null> {
  assertCalendarDate(occurrenceDate, 'occurrenceDate');
  const { schedule } = await requireScheduleAccess(actor, scheduleId, true);
  if (schedule.scheduleType !== 'recurring' || !scheduleMatchesDate(schedule, occurrenceDate)) {
    throw new SchedulingValidationError('occurrenceDate is not generated by this recurring schedule');
  }
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('work_occurrences')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return null;
  if (existing.state !== 'completed') return workOccurrenceFromRow(existing);

  const wasRescheduled = String(existing.effective_date) !== occurrenceDate;
  if (!wasRescheduled) {
    const { error } = await supabaseAdmin
      .from('work_occurrences')
      .delete()
      .eq('id', existing.id)
      .eq('schedule_id', scheduleId);
    if (error) throw error;
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('work_occurrences')
    .update({ state: 'pending', completed_at: null })
    .eq('id', existing.id)
    .eq('schedule_id', scheduleId)
    .select('*')
    .single();
  if (error) throw error;
  return workOccurrenceFromRow(data);
}
