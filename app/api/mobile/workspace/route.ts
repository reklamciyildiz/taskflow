import { NextRequest } from 'next/server';
import { projectDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticateMobileRequest, mobileErrorResponse, mobileJson, mobileOptions } from '@/lib/mobile-auth/server';
import type { MobileWorkspace } from '@/shared/mobile-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function GET(request: NextRequest) {
  try {
    const { user } = await authenticateMobileRequest(request);
    if (!user.organization_id) return mobileJson(request, { success: true, data: { processes: [], recentActions: [] } satisfies MobileWorkspace });
    const visibleByProcessAcl = await projectDb.getVisibleForUser({ organizationId: String(user.organization_id), teamId: null, userId: String(user.id) });
    const orgAdmin = user.role === 'admin' || user.role === 'owner';
    const memberships = orgAdmin
      ? { data: [], error: null }
      : await supabaseAdmin.from('team_members').select('team_id').eq('user_id', user.id);
    if (memberships.error) throw memberships.error;
    const teamIds = new Set((memberships.data ?? []).map((membership: any) => String(membership.team_id)));
    const visible = visibleByProcessAcl.filter((project: any) => !project.team_id || orgAdmin || teamIds.has(String(project.team_id)));
    const ids = visible.map((project: any) => String(project.id));
    const actionRows = ids.length
      ? await supabaseAdmin.from('tasks').select('id,title,project_id,priority,status,updated_at').eq('organization_id', user.organization_id).in('project_id', ids).order('updated_at', { ascending: false }).limit(20)
      : { data: [], error: null };
    if (actionRows.error) throw actionRows.error;
    const actions = actionRows.data ?? [];
    const activeByProject = new Map<string, number>();
    for (const action of actions) if (action.status !== 'completed') activeByProject.set(String(action.project_id), (activeByProject.get(String(action.project_id)) ?? 0) + 1);
    const names = new Map(visible.map((project: any) => [String(project.id), String(project.name)]));
    const data: MobileWorkspace = {
      processes: visible.slice(0, 20).map((project: any) => ({ id: String(project.id), name: String(project.name), teamId: project.team_id ? String(project.team_id) : null, visibility: project.visibility ?? 'team', activeActionCount: activeByProject.get(String(project.id)) ?? 0 })),
      recentActions: actions.slice(0, 8).map((action: any) => ({ id: String(action.id), title: String(action.title), projectId: String(action.project_id), projectName: names.get(String(action.project_id)) ?? 'Process', priority: action.priority ? String(action.priority) : null, status: action.status ? String(action.status) : null })),
    };
    return mobileJson(request, { success: true, data });
  } catch (error) { return mobileErrorResponse(request, error); }
}
