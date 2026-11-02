import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { projectDb, taskDb } from '@/lib/db';
import { canMutateTeamTasks } from '@/lib/server-authz';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import { parseColumnConfigFromJson } from '@/lib/types';
import { getUserSchedulingTimeZone } from '@/lib/scheduling-runtime-server';
import { resolveScheduleForSource } from '@/lib/work-schedule-server';
import { normalizeWorkScheduleInput, scheduleMatchesDate } from '@/lib/scheduling-domain';
import type { AIWriteProposal, AIWriteToolName } from './write-types';
import { matchAIEntity, normalizeAIEntityName, stageHintFromText } from './entity-matching';

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
const updateActionSchema = actionSelector.extend({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(4_000).optional(),
  descriptionMode: z.enum(['replace', 'append']).optional().default('replace'),
  priority: z.enum(['low', 'medium', 'high']).optional(),
}).strict().refine((value) => value.title !== undefined || value.description !== undefined || value.priority !== undefined, {
  message: 'At least one Action field must be changed',
});
const scheduleActionSchema = actionSelector.extend({
  scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional().default(null),
  recurrenceScope: z.enum(['series', 'occurrence']).optional(),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

/** One canonical target or a clarification. Never use a fuzzy result outside the actor's writable scope. */
function resolveNamedTarget<T>(rows: readonly T[], query: string, label: string, labelOf: (row: T) => string) {
  const result = matchAIEntity(query, rows, labelOf);
  if (result.kind === 'match') return result;
  if (result.kind === 'ambiguous') {
    throw new AIWriteProposalError('ambiguous',
      `${label} için birden fazla olası eşleşme var: ${result.candidates.join(', ')}. Lütfen tam adını belirtin.`);
  }
  throw new AIWriteProposalError('not_found',
    `${label} bulunamadı veya düzenleme yetkiniz yok. ${result.candidates.length ? `Erişilebilir seçenekler: ${result.candidates.join(', ')}.` : 'Lütfen mevcut kaydın adını belirtin.'}`);
}

/** Only word-bounded full-name mentions, not fuzzy searching the whole user command. */
function mentionedName<T>(rows: readonly T[], question: string, nameOf: (row: T) => string, label: string) {
  const utterance = ` ${normalizeAIEntityName(question)} `;
  const exact = rows.filter((row) => {
    const name = normalizeAIEntityName(nameOf(row));
    return name.length >= 4 && utterance.includes(` ${name} `);
  });
  if (exact.length === 1) return { kind: 'match' as const, value: exact[0], label: nameOf(exact[0]), mode: 'exact' as const };
  if (exact.length > 1) throw new AIWriteProposalError('ambiguous',
    `${label} belirsiz. Lütfen hedefin tam adını yazın: ${exact.map(nameOf).slice(0,5).join(', ')}.`);
  return null;
}

function resolveStageFromSentence<T>(stages: readonly T[], text: string, nameOf: (row: T) => string) {
  const phrase = stageHintFromText(text);
  if (!phrase) return null;
  const words = phrase.split(/\s+/).filter(Boolean);
  // Natural-language prefixes can include a Process or Turkish case suffix.
  // Evaluate bounded suffix phrases, never the complete command.
  const matched: Array<{kind:'match';value:T;label:string;mode:'exact'|'partial'|'typo'}> = [];
  for (let n = Math.min(words.length, 5); n >= 1; n--) {
    const result = matchAIEntity(words.slice(-n).join(' '), stages, nameOf);
    if (result.kind === 'match') matched.push(result);
    if (result.kind === 'ambiguous') throw new AIWriteProposalError('ambiguous',
      `Kolon adı belirsiz: ${result.candidates.join(', ')}. Lütfen tam adını yazın.`);
  }
  const names = [...new Set(matched.map((item) => item.label))];
  if (names.length > 1) throw new AIWriteProposalError('ambiguous',
    `Birden fazla kolon eşleşiyor: ${names.join(', ')}. Lütfen kolonu netleştirin.`);
  if (matched.length) return matched[0];
  throw new AIWriteProposalError('not_found',
    `İstenen kolon anlaşılamadı. Mevcut kolonlar: ${stages.map(nameOf).slice(0, 8).join(', ')}.`);
}

async function resolveProcess(actor: Actor, input: { processId?: string; processName?: string }, userRequest = '') {
  const projects = await visibleWritableProcesses(actor);
  if (input.processId) {
    const project = projects.find((row: any) => String(row.id) === input.processId);
    if (!project) throw new AIWriteProposalError('not_found', 'Seçilen Process bulunamadı veya düzenleme yetkiniz yok.');
    if (input.processName && matchAIEntity(input.processName, [project], (row: any) => String(row.name)).kind !== 'match') {
      throw new AIWriteProposalError('ambiguous',
        `Process ID ile belirtilen isim eşleşmiyor: “${input.processName}” / “${project.name}”. Hedefi netleştirin.`);
    }
    return project as any;
  }
  if (input.processName) return resolveNamedTarget(projects, input.processName,
    'Process', (row: any) => String(row.name)).value as any;
  const mentioned = mentionedName(projects, userRequest, (row: any) => String(row.name), 'Process');
  if (mentioned) return mentioned.value as any;
  throw new AIWriteProposalError('not_found',
    'Hangi Process? Lütfen Process adını belirtin; mevcut Action kartı için yanlış Process seçmeyeceğim.');
}

async function resolveAction(actor: Actor, input: { actionId?: string; actionTitle?: string; processId?: string; processName?: string }, userRequest = '') {
  const projects = await visibleWritableProcesses(actor);
  const candidates = input.processId || input.processName
    ? [await resolveProcess(actor, input, userRequest)] : projects;
  const projectIds = candidates.map((row: any) => String(row.id));
  if (!projectIds.length) throw new AIWriteProposalError('not_found', 'Action bulunamadı veya düzenleme yetkiniz yok.');
  let tasks: any[];
  if (input.actionId) {
    const task = await taskDb.getById(input.actionId);
    tasks = task ? [task] : [];
  } else {
    const { data, error } = await supabaseAdmin.from('tasks').select('*')
      .eq('organization_id', actor.organizationId).in('project_id', projectIds).limit(500);
    if (error) throw new AIWriteProposalError('unavailable', 'Action access could not be checked');
    tasks = data ?? [];
  }
  tasks = tasks.filter((task: any) =>
    task.organization_id === actor.organizationId && projectIds.includes(String(task.project_id)));
  let task = input.actionId
    ? tasks.find((row: any) => String(row.id) === input.actionId)
    : input.actionTitle ? resolveNamedTarget(tasks, input.actionTitle,
      'Action', (row: any) => String(row.title)).value
    : mentionedName(tasks, userRequest, (row: any) => String(row.title), 'Action')?.value;
  if (!task) throw new AIWriteProposalError('not_found',
    'Action bulunamadı veya düzenleme yetkiniz yok. Lütfen tam Action adını belirtin.');
  if (input.actionId && input.actionTitle &&
      matchAIEntity(input.actionTitle, [task], (row: any) => String(row.title)).kind !== 'match') {
    throw new AIWriteProposalError('ambiguous',
      `Action ID ile adı uyuşmuyor: “${input.actionTitle}” / “${task.title}”. Lütfen hedefi netleştirin.`);
  }
  const project = candidates.find((row: any) => String(row.id) === String(task.project_id));
  if (!project) throw new AIWriteProposalError('forbidden', 'Action is not writable');
  return { task, project };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function hashPayload(toolName: AIWriteToolName, payload: object) {
  return createHash('sha256').update(canonicalJson({ toolName, payload })).digest('hex');
}

function rowToProposal(row: any): AIWriteProposal {
  const display = row.display_snapshot ?? {};
  return {
    id: String(row.id), toolName: row.tool_name, status: row.status,
    title: String(display.title ?? 'Actiproc change proposal'), summary: String(display.summary ?? ''),
    targetLabel: String(display.targetLabel ?? ''), fields: Array.isArray(display.fields) ? display.fields : [],
    expiresAt: String(row.expires_at), result: row.result ?? null, error: row.error_message ?? null,
  };
}

export async function createAIWriteProposal(toolName: AIWriteToolName, raw: unknown, scope: Scope): Promise<AIWriteProposal> {
  let payload: Record<string, unknown>; let display: Record<string, unknown>;
  if (toolName === 'create_action') {
    const input = parseArguments(createActionSchema, raw); const project = await resolveProcess(scope, input, scope.userRequest);
    const checklistItems = input.checklistItems ?? [];
    const stages = parseColumnConfigFromJson(project.column_config);
    // Explicit IDs are authoritative. A failed ID must not fall back to a
    // guessed name or the first board column.
    let stage: (typeof stages)[number] | null = null;
    let stageCorrection: string | null = null;
    if (input.stageId) {
      stage = stages.find((item) => item.id === input.stageId) ?? null;
      if (!stage) throw new AIWriteProposalError('not_found', 'Kolon ID geçerli değil. Lütfen mevcut bir kolonu belirtin.');
      if (input.stageName && matchAIEntity(input.stageName, [stage], (item) => item.title).kind !== 'match') {
        throw new AIWriteProposalError('ambiguous', 'Kolon ID ile adı uyuşmuyor. Lütfen hedef kolonu belirtin.');
      }
    } else if (input.stageName) {
      const match = resolveNamedTarget(stages, input.stageName, 'Kolon', (item) => item.title);
      stage = match.value;
      if (match.mode === 'typo') stageCorrection = `“${input.stageName}” → “${match.label}”`;
    } else {
      const hinted = resolveStageFromSentence(stages, scope.userRequest, (item) => item.title);
      stage = hinted?.value ?? stages.find((item) => !item.isTerminal) ?? null;
      if (hinted?.mode === 'typo') stageCorrection = `Kolon → “${hinted.label}”`;
    }
    if (!stage) throw new AIWriteProposalError('not_found', 'Bu Process için kullanılabilir kolon bulunamadı.');
    const resolvedStage = stage;
    payload = { processId: String(project.id), teamId: String(project.team_id), stageId: resolvedStage.id,
      title: input.title, description: input.description, priority: input.priority, checklistItems };
    display = { title: 'Action oluşturma taslağı', summary: `“${input.title}” Action’ı oluşturulacak.`,
      targetLabel: `${project.name} / ${resolvedStage.title}`, fields: [
        { label: 'Process', value: String(project.name) },
        { label: 'Kolon', value: resolvedStage.title },
        ...(stageCorrection ? [{ label: 'Yazım eşleştirmesi · onaylayın', value: stageCorrection }] : []),
        { label: 'Öncelik', value: input.priority },
        ...(input.description ? [{ label: 'Açıklama', value: input.description }] : []),
        ...(checklistItems.length ? [{ label: 'Checklist', value: checklistItems.join(' • ') }] : []),
      ] };
  } else if (toolName === 'create_note') {
    const input = parseArguments(createNoteSchema, raw); const { task, project } = await resolveAction(scope, input, scope.userRequest);
    payload = { actionId: String(task.id), title: input.title, content: input.content, noteType: input.noteType };
    display = { title: 'Note oluşturma taslağı', summary: `“${task.title}” Action’ına Note eklenecek.`,
      targetLabel: `${project.name} / ${task.title}`, fields: [
        ...(input.title ? [{ label: 'Başlık', value: input.title }] : []), { label: 'İçerik', value: input.content },
      ] };
  } else if (toolName === 'update_checklist') {
    const input = parseArguments(updateChecklistSchema, raw); const { task, project } = await resolveAction(scope, input, scope.userRequest);
    const items = extractChecklistItemsFromTipTap(task.checklist_blocks);
    const item = input.checklistItemId
      ? items.find((candidate) => candidate.id === input.checklistItemId)
      : input.checklistText ? resolveNamedTarget(items, input.checklistText,
        'Checklist maddesi', (candidate) => candidate.text).value
      : mentionedName(items, scope.userRequest, (candidate) => candidate.text, 'Checklist maddesi')?.value;
    if (!item?.id) throw new AIWriteProposalError('not_found', 'Checklist item was not found');
    if (input.checklistItemId && input.checklistText &&
        matchAIEntity(input.checklistText, [item], (row) => row.text).kind !== 'match') {
      throw new AIWriteProposalError('ambiguous', 'Checklist maddesinin ID ve metni uyuşmuyor. Lütfen maddesini netleştirin.');
    }
    payload = { actionId: String(task.id), checklistItemId: item.id, completed: input.completed,
      expectedTaskUpdatedAt: String(task.updated_at), expectedChecked: item.checked };
    display = { title: 'Checklist güncelleme taslağı',
      summary: `“${item.text}” ${input.completed ? 'tamamlandı' : 'tamamlanmadı'} olarak işaretlenecek.`,
      targetLabel: `${project.name} / ${task.title}`, fields: [{ label: 'Yeni durum', value: input.completed ? 'Tamamlandı' : 'Tamamlanmadı' }] };
  } else if (toolName === 'update_action') {
    const input = parseArguments(updateActionSchema, raw); const { task, project } = await resolveAction(scope, input, scope.userRequest);
    const nextDescription = input.description === undefined ? undefined : input.descriptionMode === 'append'
      ? [String(task.description ?? '').trim(), input.description].filter(Boolean).join('\n\n').slice(0, 4_000) : input.description;
    const changes = [
      ...(input.title !== undefined && input.title !== task.title
        ? [{ key: 'title', label: 'Başlık', oldValue: String(task.title), newValue: input.title }] : []),
      ...(nextDescription !== undefined && nextDescription !== String(task.description ?? '')
        ? [{ key: 'description', label: 'Açıklama', oldValue: String(task.description ?? ''), newValue: nextDescription }] : []),
      ...(input.priority !== undefined && input.priority !== task.priority
        ? [{ key: 'priority', label: 'Öncelik', oldValue: String(task.priority), newValue: input.priority }] : []),
    ];
    if (!changes.length) throw new AIWriteProposalError('invalid_arguments', 'The requested Action values are already current');
    payload = { actionId: String(task.id), expectedTaskUpdatedAt: String(task.updated_at),
      patch: Object.fromEntries(changes.map((change) => [change.key, change.newValue])) };
    display = { title: 'Action güncelleme taslağı', summary: `“${task.title}” Action kaydı güncellenecek.`,
      targetLabel: `${project.name} / ${task.title}`,
      fields: changes.map(({ label, oldValue, newValue }) => ({ label, oldValue, newValue })) };
  } else {
    const input = parseArguments(scheduleActionSchema, raw); const { task, project } = await resolveAction(scope, input, scope.userRequest);
    const actor = { userId: scope.userId, organizationId: scope.organizationId, role: scope.role };
    const source = { sourceType: 'action' as const, taskId: String(task.id) };
    const [existing, timeZone] = await Promise.all([
      resolveScheduleForSource(actor, source), getUserSchedulingTimeZone(scope.userId),
    ]);
    normalizeWorkScheduleInput({ source, scheduleType: 'one_off', scheduleDate: input.scheduleDate,
      scheduleTime: input.scheduleTime, timeZone: input.scheduleTime ? timeZone : null });
    if (existing?.scheduleType === 'recurring' && !input.recurrenceScope) {
      throw new AIWriteProposalError('invalid_arguments', 'This Action is recurring. Specify whether to move one occurrence or the whole series.');
    }
    if (existing?.scheduleType !== 'recurring' && input.recurrenceScope === 'occurrence') {
      throw new AIWriteProposalError('invalid_arguments', 'This Action does not have recurring occurrences');
    }
    if (existing?.scheduleType === 'recurring' && input.recurrenceScope === 'occurrence') {
      if (!input.occurrenceDate || !scheduleMatchesDate(existing, input.occurrenceDate)) {
        throw new AIWriteProposalError('invalid_arguments', 'A valid original occurrence date is required');
      }
      if (input.scheduleTime !== null && input.scheduleTime !== existing.scheduleTime?.slice(0, 5)) {
        throw new AIWriteProposalError('invalid_arguments', 'A single recurring occurrence can change date only; change the series to change its time');
      }
    }
    const oldLabel = existing
      ? `${existing.scheduleDate}${existing.scheduleTime ? ` ${existing.scheduleTime.slice(0, 5)}` : ' (tüm gün)'}` : 'Planlanmamış';
    const newLabel = `${input.scheduleDate}${input.scheduleTime ? ` ${input.scheduleTime}` : ' (tüm gün)'} • ${timeZone}`;
    payload = { actionId: String(task.id), expectedTaskUpdatedAt: String(task.updated_at),
      expectedSchedule: existing ? { id: existing.id, updatedAt: existing.updatedAt, scheduleType: existing.scheduleType } : null,
      scheduleDate: input.scheduleDate, scheduleTime: input.scheduleTime, timeZone,
      recurrenceScope: input.recurrenceScope ?? null, occurrenceDate: input.occurrenceDate ?? null };
    display = { title: existing ? 'Planner yeniden planlama taslağı' : 'Planner planlama taslağı',
      summary: `“${task.title}” Planner kaydı ${existing ? 'güncellenecek' : 'oluşturulacak'}.`,
      targetLabel: `${project.name} / ${task.title}`,
      fields: [{ label: 'Planlama', oldValue: oldLabel, newValue: newLabel },
        ...(existing?.scheduleType === 'recurring'
          ? [{ label: 'Kapsam', value: input.recurrenceScope === 'occurrence' ? 'Tek occurrence' : 'Tüm seri' }] : [])] };
  }
  const payloadHash = hashPayload(toolName, payload);
  const { data, error } = await supabaseAdmin.rpc('create_ai_write_proposal', {
    p_organization_id: scope.organizationId, p_user_id: scope.userId, p_conversation_id: scope.conversationId,
    p_assistant_message_id: scope.assistantMessageId, p_tool_name: toolName, p_payload: payload, p_payload_hash: payloadHash,
    p_display_snapshot: display, p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error || !data?.[0]) throw new AIWriteProposalError('unavailable', 'The write proposal could not be saved');
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
