import { NextRequest, NextResponse } from 'next/server';
import { projectDb } from '@/lib/db';
import { requireAuthedUser, requireTeamScopeAccess } from '@/lib/server-authz';
import { requireTaskNoteAccess } from '@/lib/note-server';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
import {
  DEFAULT_USER_WORKSPACE_PREFERENCES,
  type ActionPanelTabOrder,
  type UserWorkspacePreferences,
} from '@/lib/user-preferences';

export const dynamic = 'force-dynamic';

function publicPreferences(row: any): UserWorkspacePreferences {
  const map = row?.process_order_by_team;
  const processOrderByTeam: Record<string, string[]> = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    for (const [teamId, ids] of Object.entries(map)) {
      if (!Array.isArray(ids)) continue;
      processOrderByTeam[teamId] = ids
        .filter((id): id is string => typeof id === 'string')
        .filter((id, index, all) => all.indexOf(id) === index)
        .slice(0, 500);
    }
  }
  return {
    processOrderByTeam,
  };
}

export async function GET(request: NextRequest) {
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;
  const taskId = request.nextUrl.searchParams.get('taskId');
  if (taskId) {
    const access = await requireTaskNoteAccess(taskId, { mutate: false }, authed);
    if (access instanceof NextResponse) return access;
    const { data, error } = await db
      .from('user_action_preferences')
      .select('action_panel_tab_order')
      .eq('user_id', authed.user.id)
      .eq('task_id', taskId)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ success: true, data: { actionPanelTabOrder: 'checklist_first' } });
      }
      return NextResponse.json({ success: false, error: 'Could not load Action preference' }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      data: { actionPanelTabOrder: data?.action_panel_tab_order === 'notes_first' ? 'notes_first' : 'checklist_first' },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const { data, error } = await db
    .from('user_settings')
    .select('process_order_by_team')
    .eq('user_id', authed.user.id)
    .maybeSingle();
  if (error) {
    // Backward-compatible while the forward migration is awaiting rollout.
    if (error.code === '42703' || error.code === 'PGRST204')
      return NextResponse.json({ success: true, data: DEFAULT_USER_WORKSPACE_PREFERENCES });
    return NextResponse.json({ success: false, error: 'Could not load preferences' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: publicPreferences(data) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function PATCH(request: NextRequest) {
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object')
    return NextResponse.json({ success: false, error: 'Invalid preference update' }, { status: 400 });

  if ('actionPanelTabOrder' in body) {
    const taskId = typeof body.taskId === 'string' ? body.taskId : '';
    if (body.actionPanelTabOrder !== 'checklist_first' && body.actionPanelTabOrder !== 'notes_first')
      return NextResponse.json({ success: false, error: 'Invalid tab order' }, { status: 400 });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId))
      return NextResponse.json({ success: false, error: 'Invalid Action' }, { status: 400 });
    const access = await requireTaskNoteAccess(taskId, { mutate: false }, authed);
    if (access instanceof NextResponse) return access;
    const saved = await db
      .from('user_action_preferences')
      .upsert({
        user_id: authed.user.id,
        task_id: taskId,
        action_panel_tab_order: body.actionPanelTabOrder as ActionPanelTabOrder,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,task_id' })
      .select('action_panel_tab_order')
      .single();
    if (saved.error) {
      const status = saved.error.code === '42P01' || saved.error.code === 'PGRST205' ? 503 : 500;
      return NextResponse.json({ success: false, error: status === 503 ? 'Preferences migration is not installed' : 'Could not save Action preference' }, { status });
    }
    return NextResponse.json({
      success: true,
      data: { actionPanelTabOrder: saved.data.action_panel_tab_order },
    });
  } else if ('processOrder' in body || 'teamId' in body) {
    const { data: existing, error: readError } = await db
      .from('user_settings')
      .select('process_order_by_team')
      .eq('user_id', authed.user.id)
      .maybeSingle();
    if (readError)
      return NextResponse.json({ success: false, error: 'Preferences migration is not installed' }, { status: 503 });
    const teamId = typeof body.teamId === 'string' ? body.teamId : '';
    const projectIds = Array.isArray(body.processOrder) ? body.processOrder : null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamId) || !projectIds || projectIds.length > 500)
      return NextResponse.json({ success: false, error: 'Invalid process order' }, { status: 400 });
    if (projectIds.some((id: unknown) => typeof id !== 'string') || new Set(projectIds).size !== projectIds.length)
      return NextResponse.json({ success: false, error: 'Invalid process order' }, { status: 400 });
    const access = await requireTeamScopeAccess(teamId, authed);
    if (access instanceof NextResponse) return access;
    const visible = await projectDb.getVisibleForUser({
      organizationId: access.organizationId,
      teamId,
      userId: authed.user.id,
    });
    const allowed = new Set(visible.map((project: any) => String(project.id)));
    if (projectIds.some((id: string) => !allowed.has(id)))
      return NextResponse.json({ success: false, error: 'Process is not accessible' }, { status: 403 });
    const currentMap = publicPreferences(existing).processOrderByTeam;
    const updates: Record<string, unknown> = {
      user_id: authed.user.id,
      updated_at: new Date().toISOString(),
      process_order_by_team: { ...currentMap, [teamId]: projectIds },
    };

    const patch = { ...updates };
    delete patch.user_id;
    const updated = await db
      .from('user_settings')
      .update(patch)
      .eq('user_id', authed.user.id)
      .select('process_order_by_team')
      .maybeSingle();
    if (updated.error)
      return NextResponse.json({ success: false, error: 'Could not save preferences' }, { status: 500 });
    if (updated.data)
      return NextResponse.json({ success: true, data: publicPreferences(updated.data) });
    const inserted = await db
      .from('user_settings')
      .insert(updates)
      .select('process_order_by_team')
      .single();
    if (inserted.error)
      return NextResponse.json({ success: false, error: 'Could not save preferences' }, { status: 500 });
    return NextResponse.json({ success: true, data: publicPreferences(inserted.data) });
  } else {
    return NextResponse.json({ success: false, error: 'Unsupported preference update' }, { status: 400 });
  }
}
