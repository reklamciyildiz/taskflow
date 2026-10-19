import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { taskDb } from '@/lib/db';
import { extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import { setChecklistItemCheckedInDocument } from '@/components/editor/reorderChecklistItem';
import { POST as createTaskRoute } from '@/app/api/tasks/route';
import { PATCH as updateTaskRoute } from '@/app/api/tasks/[id]/route';
import { POST as createNoteRoute } from '@/app/api/tasks/[id]/notes/route';
import { PUT as saveScheduleRoute } from '@/app/api/schedules/route';
import { resolveScheduleForSource, rescheduleOccurrence } from '@/lib/work-schedule-server';
import { areAIActionMutationToolsEnabled } from '@/lib/ai/chat/config';
import type { AIWriteProposal } from './write-types';
import { writeProposalPayloadHash, writeProposalRowToDto } from './write-proposals-server';

type Scope = { userId: string; organizationId: string; role?: string | null; conversationId: string };

export class AIWriteExecutionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); this.name = 'AIWriteExecutionError'; }
}

function jsonRequest(path: string, method: string, body: object) {
  return new NextRequest(`http://axiom.internal${path}`, {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function checklistDocument(items: string[]) {
  return {
    type: 'doc', content: items.length ? [{ type: 'taskList', content: items.map((text) => ({
      type: 'taskItem', attrs: { checked: false, id: randomUUID(), assigneeId: null, dueDate: null,
        reminders: [], completedAt: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })) }] : [],
  };
}

function noteDocument(text: string) {
  return { type: 'doc', content: text.split(/\n{2,}/).filter(Boolean).map((paragraph) => ({
    type: 'paragraph', content: paragraph ? [{ type: 'text', text: paragraph.slice(0, 12_000) }] : [],
  })) };
}

async function routeResult(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new AIWriteExecutionError(
    response.status === 403 ? 'AUTHORIZATION_DENIED' : 'CANONICAL_COMMAND_FAILED',
    typeof body?.error === 'string' ? body.error : 'The Axiom change could not be completed', response.status,
  );
  return body.data;
}

async function finish(row: any, status: 'completed' | 'failed', values: { result?: object; errorCode?: string; errorMessage?: string }) {
  const { data, error } = await supabaseAdmin.rpc('finish_ai_write_proposal',{
    p_proposal_id:row.id,p_user_id:row.user_id,p_organization_id:row.organization_id,
    p_execution_token:row.execution_token,p_status:status,p_result:values.result??null,
    p_error_code:values.errorCode??null,p_error_message:values.errorMessage?.slice(0,500)??null,
  });
  if (error||!data?.[0]) throw new AIWriteExecutionError('FINALIZATION_FAILED', 'The command result could not be recorded', 500);
  return writeProposalRowToDto(data[0]);
}

async function executeCanonical(row: any, scope: Scope) {
  const payload = row.payload as any;
  if (row.tool_name === 'create_action') {
    const data = await routeResult(await createTaskRoute(jsonRequest('/api/tasks', 'POST', {
      title: payload.title, description: payload.description, priority: payload.priority,
      projectId: payload.processId, teamId: payload.teamId, status: payload.stageId,
      checklistBlocks: checklistDocument(payload.checklistItems ?? []),
    })));
    return { resourceType: 'action', resourceId: String(data.id), actionId: String(data.id), label: String(data.title) };
  }
  if (row.tool_name === 'create_note') {
    const data = await routeResult(await createNoteRoute(jsonRequest(`/api/tasks/${payload.actionId}/notes`, 'POST', {
      title: payload.title, type: payload.noteType, content: noteDocument(payload.content),
    }), { params: { id: payload.actionId } }));
    return { resourceType: 'note', resourceId: String(data.id), actionId: payload.actionId,
      label: String(data.title || 'Note') };
  }
  if (row.tool_name === 'update_action') {
    const task: any = await taskDb.getById(payload.actionId);
    if (!task || task.organization_id !== row.organization_id) {
      throw new AIWriteExecutionError('AUTHORIZATION_DENIED', 'Action is no longer accessible', 403);
    }
    if (String(task.updated_at) !== payload.expectedTaskUpdatedAt) {
      throw new AIWriteExecutionError('STALE_VERSION', 'The Action changed after this proposal was created. Ask Axiom AI for a new proposal.', 409);
    }
    const data = await routeResult(await updateTaskRoute(
      jsonRequest(`/api/tasks/${payload.actionId}`, 'PATCH', payload.patch),
      { params: { id: payload.actionId } },
    ));
    return { resourceType: 'action', resourceId: String(data.id), actionId: String(data.id), label: String(data.title) };
  }
  if (row.tool_name === 'schedule_action') {
    const task: any = await taskDb.getById(payload.actionId);
    if (!task || task.organization_id !== row.organization_id) {
      throw new AIWriteExecutionError('AUTHORIZATION_DENIED', 'Action is no longer accessible', 403);
    }
    if (String(task.updated_at) !== payload.expectedTaskUpdatedAt) {
      throw new AIWriteExecutionError('STALE_VERSION', 'The Action changed after this proposal was created. Ask Axiom AI for a new proposal.', 409);
    }
    const actor = { userId: String(row.user_id), organizationId: String(row.organization_id), role: scope.role };
    const source = { sourceType: 'action' as const, taskId: payload.actionId };
    const current = await resolveScheduleForSource(actor, source);
    const expected = payload.expectedSchedule;
    if ((!expected && current)
      || (expected && (!current || current.id !== expected.id || current.updatedAt !== expected.updatedAt))) {
      throw new AIWriteExecutionError('STALE_VERSION', 'The Planner schedule changed after this proposal was created. Ask Axiom AI for a new proposal.', 409);
    }
    if (current?.scheduleType === 'recurring' && payload.recurrenceScope === 'occurrence') {
      await rescheduleOccurrence(actor, current.id, payload.occurrenceDate, payload.scheduleDate);
      return { resourceType: 'schedule', resourceId: current.id, actionId: payload.actionId, label: String(task.title) };
    }
    const scheduleType = current?.scheduleType === 'recurring' ? 'recurring' : 'one_off';
    const data = await routeResult(await saveScheduleRoute(jsonRequest('/api/schedules', 'PUT', {
      taskId: payload.actionId,
      scheduleType,
      scheduleDate: payload.scheduleDate,
      scheduleTime: payload.scheduleTime,
      timeZone: payload.scheduleTime ? payload.timeZone : null,
      recurrenceFrequency: scheduleType === 'recurring' ? current?.recurrenceFrequency : null,
      recurrenceInterval: scheduleType === 'recurring' ? current?.recurrenceInterval : 1,
      recurrenceWeekdays: scheduleType === 'recurring' ? current?.recurrenceWeekdays : [],
      endsOn: scheduleType === 'recurring' ? current?.endsOn : null,
      reminderRules: current?.reminderRules ?? [],
      clientTimeZone: payload.timeZone,
    })));
    return { resourceType: 'schedule', resourceId: String(data.id), actionId: payload.actionId, label: String(task.title) };
  }
  const task: any = await taskDb.getById(payload.actionId);
  if (!task || task.organization_id !== row.organization_id) throw new AIWriteExecutionError('AUTHORIZATION_DENIED', 'Action is no longer accessible', 403);
  const item = extractChecklistItemsFromTipTap(task.checklist_blocks).find((candidate) => candidate.id === payload.checklistItemId);
  if (!item) throw new AIWriteExecutionError('STALE_VERSION', 'Checklist item no longer exists', 409);
  if (String(task.updated_at) !== payload.expectedTaskUpdatedAt || item.checked !== payload.expectedChecked) {
    throw new AIWriteExecutionError('STALE_VERSION', 'The Action changed after this proposal was created. Ask Axiom AI for a new proposal.', 409);
  }
  const checklistBlocks = setChecklistItemCheckedInDocument(task.checklist_blocks, payload.checklistItemId, payload.completed);
  if (!checklistBlocks) throw new AIWriteExecutionError('STALE_VERSION', 'Checklist item no longer exists', 409);
  const data = await routeResult(await updateTaskRoute(jsonRequest(`/api/tasks/${payload.actionId}`, 'PATCH', { checklistBlocks }),
    { params: { id: payload.actionId } }));
  return { resourceType: 'checklist', resourceId: payload.checklistItemId, actionId: payload.actionId,
    checklistItemId: payload.checklistItemId, label: item.text };
}

export async function approveAIWriteProposal(proposalId: string, scope: Scope): Promise<AIWriteProposal> {
  const { data: existing, error } = await supabaseAdmin.from('ai_write_proposals').select('*')
    .eq('id', proposalId).eq('user_id', scope.userId).eq('organization_id', scope.organizationId)
    .eq('conversation_id', scope.conversationId).maybeSingle();
  if (error) throw new AIWriteExecutionError('UNAVAILABLE', 'Proposal could not be loaded', 503);
  if (!existing) throw new AIWriteExecutionError('NOT_FOUND', 'Proposal not found', 404);
  if (existing.status === 'completed') return writeProposalRowToDto(existing);
  if ((existing.tool_name === 'update_action' || existing.tool_name === 'schedule_action')
    && !areAIActionMutationToolsEnabled()) {
    throw new AIWriteExecutionError('FEATURE_DISABLED', 'Action update tools are not enabled', 404);
  }
  const expectedHash = writeProposalPayloadHash(existing.tool_name, existing.payload);
  if (expectedHash !== existing.payload_hash) throw new AIWriteExecutionError('INTEGRITY_ERROR', 'Proposal integrity validation failed', 409);
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_ai_write_proposal', {
    p_proposal_id: proposalId, p_user_id: scope.userId, p_organization_id: scope.organizationId,
    p_conversation_id: scope.conversationId, p_payload_hash: expectedHash,
  });
  if (claimError) throw new AIWriteExecutionError('UNAVAILABLE', 'Proposal approval could not be claimed', 503);
  const row = claimed?.[0];
  if (!row) throw new AIWriteExecutionError('ALREADY_HANDLED', 'Proposal is no longer pending', 409);
  if (row.status === 'completed') return writeProposalRowToDto(row);
  if (row.status === 'expired') return writeProposalRowToDto(row);
  if (row.status !== 'executing') throw new AIWriteExecutionError('ALREADY_HANDLED', 'Proposal is no longer pending', 409);
  try {
    const result = await executeCanonical(row, scope);
    return await finish(row, 'completed', { result });
  } catch (cause) {
    const failure = cause instanceof AIWriteExecutionError ? cause : new AIWriteExecutionError('CANONICAL_COMMAND_FAILED', 'The Axiom change could not be completed', 500);
    await finish(row, 'failed', { errorCode: failure.code, errorMessage: failure.message });
    throw failure;
  }
}

export async function rejectAIWriteProposal(proposalId: string, scope: Scope): Promise<AIWriteProposal> {
  const { data, error } = await supabaseAdmin.rpc('reject_ai_write_proposal',{
    p_proposal_id:proposalId,p_user_id:scope.userId,p_organization_id:scope.organizationId,
    p_conversation_id:scope.conversationId,
  });
  if (error) throw new AIWriteExecutionError('UNAVAILABLE', 'Proposal could not be rejected', 503);
  if (!data?.[0]) throw new AIWriteExecutionError('ALREADY_HANDLED', 'Proposal is no longer pending', 409);
  return writeProposalRowToDto(data[0]);
}
