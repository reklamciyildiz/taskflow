import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { projectDb } from '@/lib/db';
import { requireAuthedUser, requireTeamScopeAccess } from '@/lib/server-authz';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { RetrievalError } from './types';

const structuredInputSchema = z.object({
  teamId: z.string().uuid(),
  processId: z.string().uuid().optional(),
  priorities: z.array(z.enum(['low','medium','high','urgent'])).max(4).optional(),
  statusIds: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  /** Filters canonical work_schedules.schedule_date, not expanded recurrence occurrences. */
  scheduleDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduleDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(500).default(0),
  order: z.enum(['updated_desc','created_desc','title_asc']).default('updated_desc'),
});

export type StructuredActionResult = {
  id: string;
  title: string;
  description: string;
  priority: string;
  statusId: string;
  stageLabel: string;
  assigneeId: string | null;
  processId: string | null;
  processName: string | null;
  updatedAt: string;
  schedule: null | {
    id: string;
    type: 'one_off' | 'recurring';
    date: string;
    time: string | null;
    timeZone: string | null;
  };
};

const taskColumns = 'id,title,description,priority,status,assignee_id,project_id,created_at,updated_at';

export async function retrieveStructuredActions(rawInput: unknown): Promise<{
  actions: StructuredActionResult[];
  hasMore: boolean;
}> {
  const parsed = structuredInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new RetrievalError('invalid_request','Invalid structured retrieval request');
  const input = parsed.data;
  if (input.scheduleDateFrom && input.scheduleDateTo && input.scheduleDateFrom > input.scheduleDateTo) {
    throw new RetrievalError('invalid_request','Invalid schedule date range');
  }
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse || !authed.user.organization_id) {
    throw new RetrievalError('unauthorized','Authentication required');
  }
  const teamScope = await requireTeamScopeAccess(input.teamId,authed);
  if (teamScope instanceof NextResponse) throw new RetrievalError('unauthorized','Team access denied');
  const visibleProjects = await projectDb.getVisibleForUser({
    organizationId: teamScope.organizationId,
    teamId: input.teamId,
    userId: authed.user.id,
  });
  const visibleProjectIds = new Set((visibleProjects ?? []).map((project: any) => String(project.id)));
  if (input.processId && !visibleProjectIds.has(input.processId)) {
    return { actions: [],hasMore: false };
  }

  let scheduledTaskIds: string[] | null = null;
  if (input.scheduleDateFrom || input.scheduleDateTo) {
    let schedules = supabaseAdmin.from('work_schedules').select('task_id',{ count: 'exact' })
      .eq('organization_id',teamScope.organizationId)
      .eq('team_id',input.teamId)
      .is('archived_at',null)
      .limit(1_000);
    if (input.scheduleDateFrom) schedules = schedules.gte('schedule_date',input.scheduleDateFrom);
    if (input.scheduleDateTo) schedules = schedules.lte('schedule_date',input.scheduleDateTo);
    const { data,error,count } = await schedules;
    if (error) throw new RetrievalError('database_unavailable','Structured retrieval is temporarily unavailable',true);
    if ((count ?? 0) > 1_000) {
      throw new RetrievalError('invalid_request','Schedule range is too broad; narrow the requested dates');
    }
    scheduledTaskIds = [...new Set((data ?? []).map((row: any) => String(row.task_id)))];
    if (scheduledTaskIds.length === 0) return { actions: [],hasMore: false };
  }

  const pageBudget = Math.min(601,input.limit+input.offset+1);
  const runTaskQuery = async (projectIds: string[] | null) => {
    let query = supabaseAdmin.from('tasks').select(taskColumns)
      .eq('organization_id',teamScope.organizationId)
      .eq('team_id',input.teamId)
      .limit(pageBudget);
    if (projectIds === null) query = query.is('project_id',null);
    else if (projectIds.length === 1) query = query.eq('project_id',projectIds[0]);
    else query = query.in('project_id',projectIds);
    if (input.priorities?.length) query = query.in('priority',input.priorities);
    if (input.statusIds?.length) query = query.in('status',input.statusIds);
    if (input.assigneeId === null) query = query.is('assignee_id',null);
    else if (input.assigneeId) query = query.eq('assignee_id',input.assigneeId);
    if (scheduledTaskIds) query = query.in('id',scheduledTaskIds);
    if (input.order === 'title_asc') query = query.order('title',{ ascending: true });
    else query = query.order(input.order === 'created_desc' ? 'created_at' : 'updated_at',{ ascending: false });
    const { data,error } = await query;
    if (error) throw new RetrievalError('database_unavailable','Structured retrieval is temporarily unavailable',true);
    return data ?? [];
  };

  const projectIds = input.processId ? [input.processId] : [...visibleProjectIds];
  const taskGroups = await Promise.all([
    ...(input.processId ? [] : [runTaskQuery(null)]),
    ...(projectIds.length ? [runTaskQuery(projectIds)] : []),
  ]);
  const tasks = taskGroups.flat();
  const sortValue = (task: any) => input.order === 'title_asc'
    ? String(task.title).toLocaleLowerCase()
    : String(input.order === 'created_desc' ? task.created_at : task.updated_at);
  tasks.sort((a: any,b: any) => input.order === 'title_asc'
    ? sortValue(a).localeCompare(sortValue(b))
    : sortValue(b).localeCompare(sortValue(a)));
  const page = tasks.slice(input.offset,input.offset+input.limit+1);
  const selected = page.slice(0,input.limit);
  const taskIds = selected.map((task: any) => String(task.id));
  const { data: schedules,error: scheduleError } = taskIds.length
    ? await supabaseAdmin.from('work_schedules')
      .select('id,task_id,schedule_type,schedule_date,schedule_time,time_zone')
      .in('task_id',taskIds).is('checklist_item_id',null).is('archived_at',null)
    : { data: [],error: null };
  if (scheduleError) throw new RetrievalError('database_unavailable','Structured retrieval is temporarily unavailable',true);
  const scheduleByTask = new Map((schedules ?? []).map((schedule: any) => [String(schedule.task_id),schedule]));
  const projectById = new Map((visibleProjects ?? []).map((project: any) => [String(project.id),project]));

  return {
    actions: selected.map((task: any) => {
      const project: any = task.project_id ? projectById.get(String(task.project_id)) : null;
      const stage = Array.isArray(project?.column_config)
        ? project.column_config.find((column: any) => column?.id === task.status)
        : null;
      const schedule: any = scheduleByTask.get(String(task.id));
      return {
        id: String(task.id),title: String(task.title),description: String(task.description ?? ''),
        priority: String(task.priority),statusId: String(task.status),stageLabel: String(stage?.title ?? task.status),
        assigneeId: task.assignee_id ? String(task.assignee_id) : null,
        processId: task.project_id ? String(task.project_id) : null,
        processName: project?.name ? String(project.name) : null,updatedAt: String(task.updated_at),
        schedule: schedule ? {
          id: String(schedule.id),type: schedule.schedule_type,date: String(schedule.schedule_date),
          time: schedule.schedule_time ? String(schedule.schedule_time) : null,
          timeZone: schedule.time_zone ? String(schedule.time_zone) : null,
        } : null,
      };
    }),
    hasMore: page.length > input.limit,
  };
}
