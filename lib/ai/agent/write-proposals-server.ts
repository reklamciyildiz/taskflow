import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { projectDb, taskDb } from '@/lib/db';
import { canMutateTeamTasks } from '@/lib/server-authz';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import { parseColumnConfigFromJson } from '@/lib/types';
import type { AIWriteProposal, AIWriteToolName } from './write-types';

type Actor = { userId: string; organizationId: string; role?: string | null };
type Scope = Actor & { conversationId: string; assistantMessageId: string; userRequest: string };

const selector = z.object({ processId: z.string().uuid().optional(), processName: z.string().trim().min(1).max(120).optional() });
const actionSelector = selector.extend({ actionId: z.string().uuid().optional(), actionTitle: z.string().trim().min(1).max(240).optional() });
const createActionSchema = selector.extend({
  stageId: z.string().trim().min(1).max(160).optional(), stageName: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(240), description: z.string().trim().max(4_000).optional().default(''),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  checklistItems: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
}).strict();
const createNoteSchema = actionSelector.extend({
  title: z.string().trim().max(240).optional().default(''), content: z.string().trim().min(1).max(12_000),
  noteType: z.enum(['note', 'learning', 'idea', 'decision']).default('note'),
}).strict();
const updateChecklistSchema = actionSelector.extend({
  checklistItemId: z.string().trim().min(1).max(200).optional(), checklistText: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean(),
}).strict();

function parseArguments<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AIWriteProposalError('invalid_arguments', parsed.error.issues[0]?.message ?? 'Invalid write proposal');
  return parsed.data;
}

export class AIWriteProposalError extends Error {
  constructor(readonly code: 'invalid_arguments' | 'not_found' | 'forbidden' | 'ambiguous' | 'expired' | 'stale' | 'unavailable', message: string) {
    super(message); this.name = 'AIWriteProposalError';
  }
}

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('tr-TR');
const entityKey = (value: unknown) => normalize(value).replace(/[^a-z0-9çğıöşü]+/giu,' ')
  .replace(/\b(process|project|proje|süreç|surec|stage|aşama|asama|action|aksiyon)\b/giu,' ')
  .replace(/\s+/g,' ').trim();
const isAdmin = (actor: Actor) => actor.role === 'admin' || actor.role === 'owner';

async function visibleWritableProcesses(actor: Actor) {
  const { data: teams, error } = await supabaseAdmin.from('teams').select('id').eq('organization_id', actor.organizationId);
  if (error) throw new AIWriteProposalError('unavailable', 'Process access could not be checked');
  const organizationTeams = new Set((teams ?? []).map((row: any) => String(row.id)));
  let writableTeams = organizationTeams;
  if (!isAdmin(actor)) {
    const { data: memberships, error: membershipError } = await supabaseAdmin.from('team_members')
      .select('team_id,role').eq('user_id', actor.userId);
    if (membershipError) throw new AIWriteProposalError('unavailable', 'Team access could not be checked');
    writableTeams = new Set((memberships ?? []).filter((row: any) => canMutateTeamTasks(row, false))
      .map((row: any) => String(row.team_id)).filter((id) => organizationTeams.has(id)));
  }
  const projects = await projectDb.getVisibleForUser({ organizationId: actor.organizationId, teamId: null, userId: actor.userId });
  return (projects ?? []).filter((project: any) => project.team_id && writableTeams.has(String(project.team_id)));
}

function uniqueMatch<T>(rows: T[], exact: (row: T) => boolean, partial: (row: T) => boolean, label: string): T | null {
  const exactRows = rows.filter(exact);
  if (exactRows.length === 1) return exactRows[0];
  if (exactRows.length > 1) throw new AIWriteProposalError('ambiguous', `${label} is ambiguous`);
  const partialRows = rows.filter(partial);
  if (partialRows.length === 1) return partialRows[0];
  if (partialRows.length > 1) throw new AIWriteProposalError('ambiguous', `${label} is ambiguous`);
  return null;
}

async function resolveProcess(actor: Actor, input: { processId?: string; processName?: string },userRequest='') {
  const projects = await visibleWritableProcesses(actor);
  let project = input.processId
    ? projects.find((row: any) => String(row.id) === input.processId)
    : input.processName ? uniqueMatch(projects, (row: any) => entityKey(row.name) === entityKey(input.processName),
      (row: any) => entityKey(row.name).includes(entityKey(input.processName))
        || entityKey(input.processName).includes(entityKey(row.name)), 'Process name') : null;
  if(!project&&userRequest) project=uniqueMatch(projects,()=>false,
    (row:any)=>entityKey(userRequest).includes(entityKey(row.name)),'Process name');
  if (!project) throw new AIWriteProposalError('not_found', 'Process was not found or is not writable');
  return project as any;
}

async function resolveAction(actor: Actor, input: { actionId?: string; actionTitle?: string; processId?: string; processName?: string },userRequest='') {
  const projects = await visibleWritableProcesses(actor);
  let candidates = projects;
  if (input.processId || input.processName) {
    try { candidates = [await resolveProcess(actor, input,userRequest)]; }
    catch(error) { if(!(error instanceof AIWriteProposalError)||error.code!=='not_found')throw error; }
  }
  const projectIds = candidates.map((row: any) => String(row.id));
  if (!projectIds.length) throw new AIWriteProposalError('not_found', 'Action was not found or is not writable');
  let tasks: any[];
  if (input.actionId) {
    const task = await taskDb.getById(input.actionId);
    tasks = task ? [task] : [];
  } else {
    const { data, error } = await supabaseAdmin.from('tasks').select('*')
      .eq('organization_id', actor.organizationId).in('project_id', projectIds).limit(200);
    if (error) throw new AIWriteProposalError('unavailable', 'Action access could not be checked');
    tasks = data ?? [];
  }
  tasks = tasks.filter((task: any) => task.organization_id === actor.organizationId && projectIds.includes(String(task.project_id)));
  let task = input.actionId ? tasks.find((row: any) => String(row.id) === input.actionId) : input.actionTitle ? uniqueMatch(tasks,
    (row: any) => normalize(row.title) === normalize(input.actionTitle),
    (row: any) => normalize(row.title).includes(normalize(input.actionTitle)), 'Action title') : null;
  if(!task&&userRequest) task=uniqueMatch(tasks,()=>false,(row:any)=>normalize(userRequest).includes(normalize(row.title)),'Action title');
  if (!task) throw new AIWriteProposalError('not_found', 'Action was not found or is not writable');
  const project = candidates.find((row: any) => String(row.id) === String(task.project_id));
  if (!project) throw new AIWriteProposalError('forbidden', 'Action is not writable');
  return { task, project };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value&&typeof value==='object') return `{${Object.entries(value as Record<string,unknown>)
    .sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function hashPayload(toolName: AIWriteToolName, payload: object) {
  return createHash('sha256').update(canonicalJson({ toolName, payload })).digest('hex');
}

function rowToProposal(row: any): AIWriteProposal {
  const display = row.display_snapshot ?? {};
  return {
    id: String(row.id), toolName: row.tool_name, status: row.status,
    title: String(display.title ?? 'Axiom change proposal'), summary: String(display.summary ?? ''),
    targetLabel: String(display.targetLabel ?? ''), fields: Array.isArray(display.fields) ? display.fields : [],
    expiresAt: String(row.expires_at), result: row.result ?? null, error: row.error_message ?? null,
  };
}

export async function createAIWriteProposal(toolName: AIWriteToolName, raw: unknown, scope: Scope): Promise<AIWriteProposal> {
  let payload: Record<string, unknown>; let display: Record<string, unknown>;
  if (toolName === 'create_action') {
    const input = parseArguments(createActionSchema,raw); const project = await resolveProcess(scope, input,scope.userRequest);
    const checklistItems=input.checklistItems??[];
    const stages = parseColumnConfigFromJson(project.column_config);
    const stage = input.stageId ? stages.find((item) => item.id === input.stageId)
      : input.stageName ? uniqueMatch(stages, (item) => entityKey(item.title) === entityKey(input.stageName),
        (item) => entityKey(item.title).includes(entityKey(input.stageName))
          || entityKey(input.stageName).includes(entityKey(item.title)), 'Stage name') : stages.find((item) => !item.isTerminal);
    const resolvedStage=stage??uniqueMatch(stages,()=>false,(item)=>entityKey(scope.userRequest).includes(entityKey(item.title)),'Stage name');
    if (!resolvedStage) throw new AIWriteProposalError('not_found', 'Stage was not found in the selected Process');
    payload = { processId: String(project.id), teamId: String(project.team_id), stageId: resolvedStage.id,
      title: input.title, description: input.description, priority: input.priority, checklistItems };
    display = { title: 'Action oluşturma taslağı', summary: `“${input.title}” Action’ı oluşturulacak.`,
      targetLabel: `${project.name} / ${resolvedStage.title}`, fields: [
        { label: 'Öncelik', value: input.priority },
        ...(input.description ? [{ label: 'Açıklama', value: input.description }] : []),
        ...(checklistItems.length ? [{ label: 'Checklist', value: checklistItems.join(' • ') }] : []),
      ] };
  } else if (toolName === 'create_note') {
    const input = parseArguments(createNoteSchema,raw); const { task, project } = await resolveAction(scope, input,scope.userRequest);
    payload = { actionId: String(task.id), title: input.title, content: input.content, noteType: input.noteType };
    display = { title: 'Note oluşturma taslağı', summary: `“${task.title}” Action’ına Note eklenecek.`,
      targetLabel: `${project.name} / ${task.title}`, fields: [
        ...(input.title ? [{ label: 'Başlık', value: input.title }] : []), { label: 'İçerik', value: input.content },
      ] };
  } else {
    const input = parseArguments(updateChecklistSchema,raw); const { task, project } = await resolveAction(scope, input,scope.userRequest);
    const items = extractChecklistItemsFromTipTap(task.checklist_blocks);
    let item = input.checklistItemId ? items.find((candidate) => candidate.id === input.checklistItemId)
      : input.checklistText ? uniqueMatch(items, (candidate) => normalize(candidate.text) === normalize(input.checklistText),
        (candidate) => normalize(candidate.text).includes(normalize(input.checklistText)), 'Checklist item') : null;
    if(!item) item=uniqueMatch(items,()=>false,(candidate)=>normalize(scope.userRequest).includes(normalize(candidate.text)),'Checklist item');
    if (!item?.id) throw new AIWriteProposalError('not_found', 'Checklist item was not found');
    payload = { actionId: String(task.id), checklistItemId: item.id, completed: input.completed,
      expectedTaskUpdatedAt: String(task.updated_at), expectedChecked: item.checked };
    display = { title: 'Checklist güncelleme taslağı',
      summary: `“${item.text}” ${input.completed ? 'tamamlandı' : 'tamamlanmadı'} olarak işaretlenecek.`,
      targetLabel: `${project.name} / ${task.title}`, fields: [{ label: 'Yeni durum', value: input.completed ? 'Tamamlandı' : 'Tamamlanmadı' }] };
  }
  const payloadHash = hashPayload(toolName, payload);
  const { data, error } = await supabaseAdmin.rpc('create_ai_write_proposal',{
    p_organization_id:scope.organizationId,p_user_id:scope.userId,p_conversation_id:scope.conversationId,
    p_assistant_message_id:scope.assistantMessageId,p_tool_name:toolName,p_payload:payload,p_payload_hash:payloadHash,
    p_display_snapshot:display,p_expires_at:new Date(Date.now()+15*60_000).toISOString(),
  });
  if (error||!data?.[0]) throw new AIWriteProposalError('unavailable', 'The write proposal could not be saved');
  return rowToProposal(data[0]);
}

export async function listMessageWriteProposals(scope: Actor, messageIds: string[]) {
  if (!messageIds.length) return new Map<string, AIWriteProposal>();
  const { data, error } = await supabaseAdmin.from('ai_write_proposals').select('*')
    .eq('organization_id', scope.organizationId).eq('user_id', scope.userId).in('assistant_message_id', messageIds);
  if (error) throw new AIWriteProposalError('unavailable', 'Write proposals could not be loaded');
  return new Map((data ?? []).map((row: any) => [String(row.assistant_message_id), rowToProposal(row)]));
}

export const writeProposalRowToDto = rowToProposal;
export const writeProposalPayloadHash = hashPayload;
