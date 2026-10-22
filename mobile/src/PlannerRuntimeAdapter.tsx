import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PlannerRuntimeProvider, type PlannerRuntime } from '../../components/planner/PlannerRuntime';
import { canCompleteTask, canEditTask, type Role } from '../../lib/permissions';
import {
  FALLBACK_BOARD_COLUMNS,
  parseColumnConfigFromJson,
  type Project,
  type Task,
  type TaskUpdateFields,
  type Team,
  type TeamMember,
  type UpdateTaskRequest,
} from '../../lib/types';
import type { WorkSource } from '../../lib/scheduling-domain';
import { authenticatedRequest, loadPlannerContext } from './mobile-api';

type ContextPayload = { teams: any[]; team: any | null; projects: any[]; tasks: any[]; user: any };

function selectedTeamStorageKey(payload: ContextPayload) {
  const organizationId = payload.user?.organization_id ?? payload.user?.organizationId;
  const userId = payload.user?.id;
  return organizationId && userId ? `taskflow:lastTeamId:${organizationId}:${userId}` : null;
}

function readSelectedTeamId(payload: ContextPayload) {
  try {
    const key = selectedTeamStorageKey(payload);
    const scoped = key ? window.localStorage.getItem(key) : null;
    const legacy = window.localStorage.getItem('taskflow:lastTeamId');
    return [scoped, legacy].find((id) => id && payload.teams.some((team) => String(team.id) === id)) ?? null;
  } catch {
    return null;
  }
}

function rememberSelectedTeam(payload: ContextPayload, teamId: string) {
  try {
    const key = selectedTeamStorageKey(payload);
    if (key) window.localStorage.setItem(key, teamId);
    window.localStorage.setItem('taskflow:lastTeamId', teamId);
  } catch {
    // Team selection is a convenience preference; failure must not affect authentication.
  }
}

function taskFromApi(row: any): Task {
  return {
    id: String(row.id), title: String(row.title), description: String(row.description ?? ''),
    status: String(row.status ?? 'todo'), priority: row.priority ?? 'medium',
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    reminders: Array.isArray(row.reminders) ? row.reminders : [], schedule: row.work_schedule ?? null,
    assigneeId: row.assignee_id ?? null, customerId: row.customer_id ?? null,
    customerName: row.customer?.name, teamId: String(row.team_id), projectId: row.project_id ?? null,
    checklistBlocks: row.checklist_blocks ?? null, boardPosition: Number(row.board_position ?? 0),
    createdBy: String(row.created_by ?? row.user_id ?? ''), createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at), attachments: [],
    comments: (row.comments ?? []).map((comment: any) => ({
      id: String(comment.id), text: String(comment.text), authorId: String(comment.author_id),
      createdAt: new Date(comment.created_at),
    })),
  };
}

function projectFromApi(row: any): Project {
  return {
    id: String(row.id), name: String(row.name), organizationId: String(row.organization_id),
    teamId: row.team_id ? String(row.team_id) : null, columnConfig: parseColumnConfigFromJson(row.column_config),
    visibility: row.visibility ?? 'team', createdBy: row.created_by ?? null,
    createdAt: new Date(row.created_at),
  };
}

function teamFromApi(row: any): Team {
  return {
    id: String(row.id), name: String(row.name), description: String(row.description ?? ''),
    organizationId: String(row.organization_id), createdBy: String(row.created_by ?? ''),
    createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at ?? row.created_at),
    members: (row.team_members ?? []).map((membership: any): TeamMember => ({
      id: String(membership.user?.id ?? membership.user_id),
      name: String(membership.user?.name ?? 'Unknown'), email: String(membership.user?.email ?? ''),
      role: membership.role ?? 'member', avatar: String(membership.user?.avatar_url ?? ''),
      isOnline: Boolean(membership.user?.is_online), joinedAt: new Date(membership.joined_at ?? row.created_at),
    })),
  };
}

function taskUpdates(updates: TaskUpdateFields): UpdateTaskRequest {
  const body: UpdateTaskRequest = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.priority !== undefined) body.priority = updates.priority;
  if (updates.dueDate !== undefined) body.dueDate = updates.dueDate ? updates.dueDate.toISOString() : null;
  if (updates.reminders !== undefined) body.reminders = updates.reminders ?? null;
  if (updates.assigneeId !== undefined) body.assigneeId = updates.assigneeId;
  if (updates.customerId !== undefined) body.customerId = updates.customerId;
  if (updates.projectId !== undefined) body.projectId = updates.projectId;
  if (updates.checklistBlocks !== undefined) body.checklistBlocks = updates.checklistBlocks;
  if (updates.boardPosition !== undefined) body.boardPosition = updates.boardPosition;
  return body;
}

async function response<T>(path: string, init?: RequestInit) {
  try { return { success: true, data: await authenticatedRequest<T>(path, init) }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Request failed.' }; }
}

function sourceQuery(source: WorkSource) {
  const query = new URLSearchParams({ taskId: source.taskId });
  if (source.sourceType === 'checklist_item') query.set('checklistItemId', source.checklistItemId);
  return query.toString();
}

export function MobilePlannerRuntime({ children, onOpenAction, onError }: {
  children: ReactNode;
  onOpenAction: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [payload, setPayload] = useState<ContextPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const available = await loadPlannerContext() as ContextPayload;
      const selectedTeamId = readSelectedTeamId(available);
      setPayload(selectedTeamId
        ? await loadPlannerContext(selectedTeamId) as ContextPayload
        : available);
    }
    catch (error) { onError(error instanceof Error ? error.message : 'Planner context could not be loaded.'); }
    finally { setLoading(false); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const tasks = useMemo(() => (payload?.tasks ?? []).map(taskFromApi), [payload?.tasks]);
  const projects = useMemo(() => (payload?.projects ?? []).map(projectFromApi), [payload?.projects]);
  const teams = useMemo(() => (payload?.teams ?? []).map(teamFromApi), [payload?.teams]);
  const currentTeam = useMemo(() => payload?.team ? teamFromApi(payload.team) : null, [payload?.team]);
  const currentUser = useMemo<TeamMember | null>(() => {
    if (!payload?.user) return null;
    const member = currentTeam?.members.find((candidate) => candidate.id === String(payload.user.id));
    return member ?? {
      id: String(payload.user.id), name: String(payload.user.name ?? payload.user.email),
      email: String(payload.user.email), role: payload.user.role === 'owner' ? 'admin' : payload.user.role ?? 'member',
      avatar: String(payload.user.avatar_url ?? ''), isOnline: true, joinedAt: new Date(),
    };
  }, [currentTeam, payload?.user]);
  const role: Role = currentUser?.role === 'viewer' ? 'viewer' : currentUser?.role === 'admin' ? 'admin' : 'member';

  const plannerApi = useMemo(() => ({
    getToday: (input: { date: string; teamId: string; timeZone: string }) => response<any>(`/api/planner/today?${new URLSearchParams(input)}`),
    getUpcoming: (input: { startDate: string; teamId: string; horizonDays?: string }) => response<any>(`/api/planner/upcoming?${new URLSearchParams({ startDate: input.startDate, teamId: input.teamId, horizonDays: input.horizonDays ?? '14' })}`),
    getRoutines: (input: { startDate: string; teamId: string }) => response<any>(`/api/planner/routines?${new URLSearchParams(input)}`),
    setOccurrenceCompleted: (input: { scheduleId: string; occurrenceDate: string; completed: boolean }) => response<any>('/api/planner/occurrences', { method: 'PATCH', body: JSON.stringify(input) }),
    getOccurrence: (scheduleId: string, occurrenceDate: string) => response<any>(`/api/planner/occurrences?${new URLSearchParams({ scheduleId, occurrenceDate })}`),
    mutateOccurrence: (input: any) => response<any>('/api/planner/occurrences', { method: 'PATCH', body: JSON.stringify(input) }),
  }), []);

  const scheduleApi = useMemo(() => ({
    get: (source: WorkSource) => response<any>(`/api/schedules?${sourceQuery(source)}`),
    save: (input: any) => response<any>('/api/schedules', {
      method: 'PUT',
      body: JSON.stringify({ ...input, taskId: input.source.taskId,
        checklistItemId: input.source.sourceType === 'checklist_item' ? input.source.checklistItemId : null,
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null, source: undefined }),
    }),
    remove: (source: WorkSource) => response<null>(`/api/schedules?${sourceQuery(source)}`, { method: 'DELETE' }),
  }), []);

  const runtime = useMemo<PlannerRuntime>(() => ({
    tasks, projects, teams, currentTeam, currentUser, generalBoardColumns: FALLBACK_BOARD_COLUMNS, loading,
    openTaskEditor: (taskId) => onOpenAction(taskId),
    setCurrentTeam: async (teamId) => {
      if (!payload?.teams.some((team) => String(team.id) === teamId)) {
        onError('You do not have access to that workspace.');
        return;
      }
      setLoading(true);
      try {
        const selected = await loadPlannerContext(teamId) as ContextPayload;
        if (String(selected.team?.id) !== teamId) throw new Error('Workspace selection could not be verified.');
        rememberSelectedTeam(selected, teamId);
        setPayload(selected);
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Workspace could not be loaded.');
      } finally {
        setLoading(false);
      }
    },
    canCompleteTask: (assigneeId) => Boolean(currentUser && canCompleteTask(role, currentUser.id, assigneeId)),
    canEditTask: (creatorId, assigneeId) => Boolean(currentUser && canEditTask(role, currentUser.id, creatorId, assigneeId)),
    addTask: async (input) => {
      const created = await authenticatedRequest<any>('/api/tasks', { method: 'POST', body: JSON.stringify({
        title: input.title, description: input.description, status: input.status, priority: input.priority,
        dueDate: input.dueDate?.toISOString(), assigneeId: input.assigneeId, customerId: input.customerId,
        teamId: input.teamId, projectId: input.projectId,
      }) });
      const task = taskFromApi(created);
      setPayload((current) => current ? { ...current, tasks: [created, ...current.tasks] } : current);
      return task;
    },
    updateTask: async (id, updates) => {
      try {
        const updated = await authenticatedRequest<any>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(taskUpdates(updates)) });
        setPayload((current) => current ? { ...current, tasks: current.tasks.map((task) => String(task.id) === id ? updated : task) } : current);
        return true;
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Action could not be updated.');
        return false;
      }
    },
    plannerApi: plannerApi as PlannerRuntime['plannerApi'],
    scheduleApi: scheduleApi as PlannerRuntime['scheduleApi'],
  }), [currentTeam, currentUser, loading, onError, onOpenAction, payload, plannerApi, projects, role, scheduleApi, tasks, teams]);

  return <PlannerRuntimeProvider runtime={runtime}>{children}</PlannerRuntimeProvider>;
}
