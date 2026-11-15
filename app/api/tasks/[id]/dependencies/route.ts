import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { projectDb } from '@/lib/db';
import { requireTaskNoteAccess } from '@/lib/note-server';
import { readInboxBoard } from '@/lib/inbox-board-server';
import { parseColumnConfigFromJson } from '@/lib/types';
import { resolveStageLifecycle } from '@/lib/stage-lifecycle';
import {
  taskDependencyDbError,
  type TaskDependencyOverview,
  type TaskDependencyReference,
} from '@/lib/task-dependencies';
import type { ApiResponse } from '@/lib/types';

type RouteContext = { params: { id: string } };
const taskIdSchema = z.string().uuid();
const commandSchema = z.object({
  blockerTaskId: taskIdSchema.optional(),
  blockedTaskId: taskIdSchema.optional(),
}).strict().refine(data => Number(Boolean(data.blockerTaskId)) + Number(Boolean(data.blockedTaskId)) === 1);

function fail(message: string, status: number, code?: string) {
  return NextResponse.json<ApiResponse<null>>({ success: false, error: message, code }, { status });
}

/** ACL must hold independently for both Action IDs, including private Processes. */
async function authorizePair(request: NextRequest, id: string, peerId: string) {
  const current = await requireTaskNoteAccess(id, { mutate: true }, undefined, request);
  if (current instanceof NextResponse) return current;
  const other = await requireTaskNoteAccess(peerId, { mutate: true }, { user: current.user });
  if (other instanceof NextResponse) return other;
  if (String(current.task.organization_id) !== String(other.task.organization_id)
      || String(current.task.team_id) !== String(other.task.team_id)) {
    return fail('Both Actions must belong to the same team', 403);
  }
  return current;
}

/** Read scoped links, redacting IDs and metadata from restricted/private Processes. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!taskIdSchema.safeParse(params.id).success) return fail('Invalid Action ID', 400);
  try {
    const access = await requireTaskNoteAccess(params.id, { mutate: false }, undefined, request);
    if (access instanceof NextResponse) return access;
    const orgId = String(access.task.organization_id);
    const teamId = String(access.task.team_id);
    const { data: links, error: edgesError } = await supabaseAdmin.from('task_dependencies')
      .select('id,blocker_task_id,blocked_task_id,created_at')
      .eq('organization_id', orgId).eq('team_id', teamId)
      .or('blocker_task_id.eq.' + params.id + ',blocked_task_id.eq.' + params.id)
      .order('created_at', { ascending: true }).limit(500);
    if (edgesError) {
      console.error('Task dependency lookup failed', edgesError.code);
      return fail('Action dependencies are temporarily unavailable', 503);
    }
    const relatedIds = [...new Set((links ?? []).map(link =>
      String(link.blocker_task_id) === params.id ? String(link.blocked_task_id) : String(link.blocker_task_id)))];
    const result: TaskDependencyOverview = {
      taskId: params.id, blocked: false, blockedBy: [], blocking: [],
    };
    if (!relatedIds.length) return NextResponse.json<ApiResponse<TaskDependencyOverview>>({ success: true, data: result });

    const [{ data: related, error: tasksError }, visibleProjects] = await Promise.all([
      supabaseAdmin.from('tasks').select('id,title,status,project_id')
        .eq('organization_id', orgId).eq('team_id', teamId).in('id', relatedIds),
      projectDb.getVisibleForUser({ organizationId: orgId, teamId, userId: String(access.user.id) }),
    ]);
    if (tasksError) {
      console.error('Task dependency detail lookup failed', tasksError.code);
      return fail('Action dependencies are temporarily unavailable', 503);
    }
    const allowedProjects = new Map<string, any>(visibleProjects.map((p: any) => [String(p.id), p]));
    const tasks = new Map((related ?? []).map(task => [String(task.id), task]));
    const projectIds = [...new Set((related ?? []).map(task => task.project_id).filter((id): id is string => Boolean(id)))];
    const [allProjectResult, inbox] = await Promise.all([
      projectIds.length
        ? supabaseAdmin.from('projects').select('id,column_config')
          .eq('organization_id', orgId).in('id', projectIds)
        : Promise.resolve({ data: [], error: null }),
      readInboxBoard(teamId),
    ]);
    if (allProjectResult.error) {
      console.error('Task dependency stage lookup failed', allProjectResult.error.code);
      return fail('Action dependencies are temporarily unavailable', 503);
    }
    // Server may inspect hidden Process stage flags to calculate a correct
    // blocked state, but never returns their IDs, titles or configuration.
    const stageConfig = new Map((allProjectResult.data ?? []).map(p => [String(p.id), p.column_config]));
    const terminal = (task: { project_id: string | null; status: string }) => {
      if (!task.project_id) return inbox.configured
        ? resolveStageLifecycle(task.status, inbox.stages).isTerminal
        : task.status === 'done';
      const config = stageConfig.get(String(task.project_id));
      if (!config) return false;
      return resolveStageLifecycle(task.status, parseColumnConfigFromJson(config)).isTerminal;
    };

    for (const edge of links ?? []) {
      const incoming = String(edge.blocked_task_id) === params.id;
      const peerId = String(incoming ? edge.blocker_task_id : edge.blocked_task_id);
      const peer = tasks.get(peerId);
      const accessible = peer && (!peer.project_id || allowedProjects.has(String(peer.project_id)));
      // A blocked flag may be shown without revealing an inaccessible peer's identity.
      if (incoming && (!peer || !terminal(peer))) result.blocked = true;
      if (!accessible) continue;
      const ref: TaskDependencyReference = {
        id: String(edge.id), taskId: peerId, title: String(peer.title),
        status: String(peer.status), projectId: peer.project_id ?? null,
        isTerminal: terminal(peer), createdAt: String(edge.created_at),
      };
      (incoming ? result.blockedBy : result.blocking).push(ref);
    }
    return NextResponse.json<ApiResponse<TaskDependencyOverview>>({ success: true, data: result });
  } catch (error) {
    console.error('Task dependency read failed', error);
    return fail('Action dependencies are temporarily unavailable', 503);
  }
}

function parseCommand(value: unknown, taskId: string) {
  const command = commandSchema.safeParse(value);
  if (!command.success) return null;
  return {
    blockerId: command.data.blockerTaskId ?? taskId,
    blockedId: command.data.blockedTaskId ?? taskId,
    peerId: command.data.blockerTaskId ?? command.data.blockedTaskId!,
  };
}

/** Idempotent link creation, with database-serialized cycle and completion guards. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!taskIdSchema.safeParse(params.id).success) return fail('Invalid Action ID', 400);
  const input = parseCommand(await request.json().catch(() => null), params.id);
  if (!input) return fail('Specify one blockerTaskId or blockedTaskId', 400);
  if (input.blockerId === input.blockedId) return fail('An Action cannot depend on itself', 400);
  try {
    const access = await authorizePair(request, params.id, input.peerId);
    if (access instanceof NextResponse) return access;
    // Repeated requests for the same valid edge must remain idempotent even
    // when a finished blocker was later reopened. Database UNIQUE still closes
    // the concurrent-insert race after this read.
    const { data: existing, error: lookupError } = await supabaseAdmin.from('task_dependencies')
      .select('id')
      .eq('organization_id', String(access.task.organization_id))
      .eq('team_id', String(access.task.team_id))
      .eq('blocker_task_id', input.blockerId).eq('blocked_task_id', input.blockedId)
      .maybeSingle();
    if (lookupError) {
      console.error('Task dependency preflight lookup failed', lookupError.code);
      return fail('Could not connect these Actions', 503);
    }
    if (existing) return NextResponse.json({ success: true, data: { linked: true } });

    const { error } = await supabaseAdmin.from('task_dependencies').insert({
      blocker_task_id: input.blockerId, blocked_task_id: input.blockedId,
      organization_id: String(access.task.organization_id),
      team_id: String(access.task.team_id),
      created_by: String(access.user.id),
    });
    if (error?.code === '23505') return NextResponse.json({ success: true, data: { linked: true } });
    if (error) {
      const known = taskDependencyDbError(error);
      if (known) return fail(known.message, known.status, known.code);
      console.error('Task dependency insert failed', error.code);
      return fail('Could not connect these Actions', 503);
    }
    return NextResponse.json({ success: true, data: { linked: true } }, { status: 201 });
  } catch (error) {
    console.error('Task dependency create failed', error);
    return fail('Could not connect these Actions', 503);
  }
}

/** Unlinking never deletes either Action. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!taskIdSchema.safeParse(params.id).success) return fail('Invalid Action ID', 400);
  const input = parseCommand(await request.json().catch(() => null), params.id);
  if (!input) return fail('Specify one blockerTaskId or blockedTaskId', 400);
  try {
    const access = await authorizePair(request, params.id, input.peerId);
    if (access instanceof NextResponse) return access;
    const { error } = await supabaseAdmin.from('task_dependencies').delete()
      .eq('organization_id', String(access.task.organization_id))
      .eq('team_id', String(access.task.team_id))
      .eq('blocker_task_id', input.blockerId).eq('blocked_task_id', input.blockedId);
    if (error) {
      console.error('Task dependency removal failed', error.code);
      return fail('Could not disconnect these Actions', 503);
    }
    return NextResponse.json({ success: true, data: { linked: false } });
  } catch (error) {
    console.error('Task dependency delete failed', error);
    return fail('Could not disconnect these Actions', 503);
  }
}
