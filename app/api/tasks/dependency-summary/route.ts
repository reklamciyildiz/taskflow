import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser, requireTeamScopeAccess } from '@/lib/server-authz';
import { projectDb } from '@/lib/db';
import { readInboxBoard } from '@/lib/inbox-board-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseColumnConfigFromJson } from '@/lib/types';
import { resolveStageLifecycle } from '@/lib/stage-lifecycle';
import type { TeamDependencySummary, TaskDependencyFlags } from '@/lib/task-dependency-ui';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE = 800;
const MAX_EDGES = 24000;

type Edge = { blocker_task_id: string; blocked_task_id: string };
type ScopedTask = { id: string; status: string; project_id: string | null };

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: NO_STORE });
}

/**
 * One scoped query for Board/List; never N+1 per-card requests.
 * All relationships and hidden stage flags are calculated server-side.
 * The response contains ONLY the caller's visible Action IDs and boolean flags.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthedUser(request);
    if (auth instanceof NextResponse) return auth;
    const teamId = request.nextUrl.searchParams.get('teamId') ?? '';
    if (!UUID.test(teamId)) return fail('Invalid team ID', 400);
    const access = await requireTeamScopeAccess(teamId, auth);
    if (access instanceof NextResponse) return access;
    const orgId = access.organizationId;

    const [visibleProjects, inbox] = await Promise.all([
      projectDb.getVisibleForUser({
        organizationId: orgId, teamId, userId: String(auth.user.id),
      }),
      readInboxBoard(teamId),
    ]);
    const visibleProjectIds = new Set(visibleProjects.map((p: any) => String(p.id)));

    // No partial snapshots: if a workspace exceeds the bounded read cap,
    // return a retryable error instead of incorrectly claiming Actions are ready.
    const edges: Edge[] = [];
    for (let offset = 0; offset <= MAX_EDGES; offset += PAGE) {
      const { data, error } = await supabaseAdmin.from('task_dependencies')
        .select('blocker_task_id,blocked_task_id')
        .eq('organization_id', orgId).eq('team_id', teamId)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as Edge[];
      edges.push(...batch);
      if (batch.length < PAGE) break;
      if (edges.length >= MAX_EDGES) return fail('Dependency overview is too large. Narrow the workspace.', 503);
    }
    if (!edges.length) {
      return NextResponse.json({ success: true, data: {} as TeamDependencySummary }, { headers: NO_STORE });
    }

    const ids = [...new Set(edges.flatMap(edge => [edge.blocker_task_id, edge.blocked_task_id]))];
    const tasks = new Map<string, ScopedTask>();
    // Avoid Supabase/PostgREST URL and max-row limits for large teams.
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data, error } = await supabaseAdmin.from('tasks')
        .select('id,status,project_id')
        .eq('organization_id', orgId).eq('team_id', teamId)
        .in('id', ids.slice(offset, offset + 100));
      if (error) throw error;
      for (const task of data ?? []) tasks.set(String(task.id), task);
    }
    const projectIds = [...new Set([...tasks.values()].map(t => t.project_id).filter((id): id is string => !!id))];
    const stages = new Map<string, unknown>();
    for (let offset = 0; offset < projectIds.length; offset += 100) {
      const { data, error } = await supabaseAdmin.from('projects')
        .select('id,column_config').eq('organization_id', orgId)
        .in('id', projectIds.slice(offset, offset + 100));
      if (error) throw error;
      for (const project of data ?? []) stages.set(String(project.id), project.column_config);
    }

    const isTerminal = (task: ScopedTask | undefined): boolean => {
      if (!task) return false; // Missing reference is never proof of completion.
      if (!task.project_id) return inbox.configured
        ? resolveStageLifecycle(task.status, inbox.stages).isTerminal
        : task.status === 'done';
      const config = stages.get(task.project_id);
      if (!config) return false;
      return resolveStageLifecycle(task.status, parseColumnConfigFromJson(config)).isTerminal;
    };
    const canSee = (task: ScopedTask | undefined): task is ScopedTask =>
      Boolean(task && (!task.project_id || visibleProjectIds.has(task.project_id)));

    const summary: TeamDependencySummary = {};
    const ensure = (id: string): TaskDependencyFlags =>
      summary[id] ?? (summary[id] = { blocked: false, ready: false, blocking: false, hasPredecessors: false });

    for (const edge of edges) {
      const blocked = tasks.get(edge.blocked_task_id);
      const blocker = tasks.get(edge.blocker_task_id);
      if (canSee(blocked)) {
        const flag = ensure(blocked.id);
        flag.hasPredecessors = true;
        if (!isTerminal(blocker)) flag.blocked = true;
      }
      if (canSee(blocker)) ensure(blocker.id).blocking = true;
    }
    for (const [id, flag] of Object.entries(summary)) {
      flag.ready = flag.hasPredecessors && !flag.blocked && !isTerminal(tasks.get(id));
    }

    return NextResponse.json({ success: true, data: summary }, { headers: NO_STORE });
  } catch (error) {
    console.error('Team dependency summary failed', (error as { code?: string })?.code ?? error);
    return fail('Could not load dependency status', 503);
  }
}
