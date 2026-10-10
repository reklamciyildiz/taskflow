import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from './supabase-admin';
import { projectDb } from './db';
import { isOrgAdmin, requireAuthedUser, requireTeamMemberOrOrgAdmin } from './server-authz';
import { requireTaskNoteAccess } from './note-server';
import { orderedProperties, propertyCommandSchema, propertyValueSchema, type ProcessPropertyData } from './process-properties';
import { z } from 'zod';

export class PropertyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function propertyErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid property data' }, { status: 400 });
  if (error instanceof PropertyError) return NextResponse.json({ error: error.message }, { status: error.status });
  const dbError = error as { code?: string };
  if (['23503', '23514', '23505', '40001', '40P01'].includes(dbError?.code ?? '')) {
    return NextResponse.json({ error: 'Property changed, archived, or is not valid for this Action. Refresh and retry.' }, { status: 409 });
  }
  console.error('Process properties request failed', error);
  return NextResponse.json({ error: 'Properties could not be loaded or saved.' }, { status: 500 });
}

export async function requireProcessPropertyAccess(projectId: string, teamId: string | null, manage = false) {
  if (!z.string().uuid().safeParse(projectId).success || !z.string().uuid().safeParse(teamId).success) throw new PropertyError('Select a valid process and team');
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;
  const scope = await requireTeamMemberOrOrgAdmin(teamId!, authed);
  if (scope instanceof NextResponse) return scope;
  const visible = await projectDb.getVisibleForUser({ organizationId: scope.team.organization_id, teamId: teamId!, userId: authed.user.id });
  const project = visible.find((p: any) => p.id === projectId);
  if (!project) throw new PropertyError('Process not found', 404);
  const canManage = isOrgAdmin(authed.user) || (!!project.team_id && scope.membership?.role === 'admin');
  if (manage && !canManage) throw new PropertyError('Only process administrators can manage properties', 403);
  return { project, teamId: teamId!, organizationId: scope.team.organization_id as string, canManage };
}

async function paged(query: (offset: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query(offset);
    if (error) throw error;
    rows.push(...data ?? []);
    if (!data || data.length < 500) return rows;
  }
}
export async function readProcessProperties(access: Exclude<Awaited<ReturnType<typeof requireProcessPropertyAccess>>, NextResponse>): Promise<ProcessPropertyData> {
  const projectId = access.project.id;
  const [properties, options, values] = await Promise.all([
    paged(offset => db.from('process_properties').select('*').eq('project_id', projectId).order('id').range(offset, offset + 499)),
    paged(offset => db.from('process_property_options').select('*').eq('project_id', projectId).order('id').range(offset, offset + 499)),
    paged(offset => db.from('action_property_values').select('task_id,project_id,property_id,option_id,tasks!inner(team_id,organization_id)')
      .eq('project_id', projectId).eq('tasks.team_id', access.teamId).eq('tasks.organization_id', access.organizationId)
      .order('task_id').order('property_id').range(offset, offset + 499)),
  ]);
  return { properties: orderedProperties(properties), options: orderedProperties(options),
    values: values.map(({ tasks: _tasks, ...value }) => value), canManage: access.canManage };
}

export async function mutateProcessProperty(projectId: string, input: unknown) {
  const command = propertyCommandSchema.parse(input);
  const ensure = async (query: PromiseLike<{ data: any; error: any }>) => {
    const result = await query;
    if (result.error) throw result.error;
    if (!result.data) throw new PropertyError('Property missing or archived', 409);
    return result.data;
  };
  const nextPosition = async (table: string, propertyId?: string) => {
    let query = db.from(table).select('position').eq('project_id', projectId).is('archived_at', null);
    if (propertyId) query = query.eq('property_id', propertyId);
    const { data, error } = await query.order('position', { ascending: false }).limit(1);
    if (error) throw error;
    return (data?.[0]?.position ?? -1) + 1;
  };
  switch (command.operation) {
    case 'create_property':
      await ensure(db.from('process_properties').insert({ project_id: projectId, name: command.name, position: await nextPosition('process_properties') }).select('id').single()); break;
    case 'rename_property':
    case 'archive_property':
      await ensure(db.from('process_properties').update(command.operation === 'rename_property' ? { name: command.name } : { archived_at: new Date().toISOString() })
        .eq('project_id', projectId).eq('id', command.id).is('archived_at', null).select('id').maybeSingle()); break;
    case 'create_option':
      await ensure(db.from('process_property_options').insert({ project_id: projectId, property_id: command.propertyId, label: command.label, color: command.color,
        position: await nextPosition('process_property_options', command.propertyId) }).select('id').single()); break;
    case 'update_option':
    case 'archive_option':
      await ensure(db.from('process_property_options').update(command.operation === 'update_option' ? { label: command.label, color: command.color } : { archived_at: new Date().toISOString() })
        .eq('project_id', projectId).eq('id', command.id).is('archived_at', null).select('id').maybeSingle()); break;
    case 'reorder': {
      const { error } = await db.rpc('reorder_process_property_items', { p_project_id: projectId, p_property_id: command.propertyId, p_ids: command.ids });
      if (error) throw error;
      break;
    }
  }
}

export async function setActionProperty(taskId: string, input: unknown) {
  if (!z.string().uuid().safeParse(taskId).success) throw new PropertyError('Invalid Action');
  const command = propertyValueSchema.parse(input);
  // Reuse existing Action organization/team/viewer/project-visibility authorization unchanged.
  const access = await requireTaskNoteAccess(taskId, { mutate: true });
  if (access instanceof NextResponse) return access;
  const projectId = access.task.project_id;
  if (!projectId) throw new PropertyError('General Actions do not have process properties');
  const { data: property, error: lookupError } = await db.from('process_properties').select('id').eq('project_id', projectId).eq('id', command.propertyId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!property) throw new PropertyError('Property does not belong to this process');
  const { error } = command.optionId === null
    ? await db.from('action_property_values').delete().eq('task_id', taskId).eq('project_id', projectId).eq('property_id', command.propertyId)
    : await db.from('action_property_values').upsert({ task_id: taskId, project_id: projectId, property_id: command.propertyId, option_id: command.optionId }, { onConflict: 'task_id,property_id' });
  if (error) throw error;
  return { projectId, teamId: access.task.team_id };
}
