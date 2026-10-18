import 'server-only';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { SourceCitation } from '@/lib/ai/retrieval/types';
import type { AIChatContext, AIChatMessage, AIConversationSummary } from './types';
import { aiChatLimits } from './config';

const contextSchema = z.object({
  origin: z.enum(['global','knowledge_hub']).default('global'),
  teamId: z.string().uuid().optional(),
  processId: z.string().uuid().optional(),
}).strict();

const citationSnapshotSchema = z.object({
  citationId: z.string().regex(/^[0-9a-f]{64}$/),
  sourceDocumentId: z.string().uuid(),
  sourceType: z.enum(['action','checklist','note','process','attachment']),
  sourceId: z.string(),
  actionId: z.string().uuid().nullable(),
  checklistItemId: z.string().nullable(),
  noteId: z.string().uuid().nullable(),
  processId: z.string().uuid().nullable(),
  attachmentId: z.string().uuid().nullable(),
  process: z.object({ id: z.string().uuid(),name: z.string().nullable() }).nullable(),
  title: z.string(),snippet: z.string(),sourceUpdatedAt: z.string(),
  chunk: z.object({ id: z.string(),ordinal: z.number() }),
  index: z.object({ version: z.string(),embeddingModel: z.string() }),
  score: z.object({
    mode: z.enum(['semantic','keyword','hybrid']),semantic: z.number().nullable(),
    keyword: z.number().nullable(),fused: z.number(),semanticRank: z.number().nullable(),
    keywordRank: z.number().nullable(),
  }),
  navigation: z.object({
    target: z.enum(['action','note','checklist','process','attachment']),
    actionId: z.string().uuid().nullable(),sourceId: z.string(),
  }),
});

export class ConversationError extends Error {
  constructor(readonly code: 'not_found'|'conflict'|'database_unavailable',message: string) {
    super(message); this.name='ConversationError';
  }
}

function summary(row: any): AIConversationSummary {
  const context = contextSchema.safeParse(row.context);
  return {
    id:String(row.id),title:String(row.title),context:context.success ? context.data : { origin:'global' },
    createdAt:String(row.created_at),updatedAt:String(row.updated_at),lastMessageAt:String(row.last_message_at),
  };
}

export async function createConversation(scope: { userId:string;organizationId:string }, rawContext: unknown = {}) {
  const context = contextSchema.parse(rawContext);
  const { data,error } = await supabaseAdmin.from('ai_conversations').insert({
    user_id:scope.userId,organization_id:scope.organizationId,context,title:'New conversation',
  }).select('*').single();
  if (error || !data) throw new ConversationError('database_unavailable','Conversation could not be created');
  return summary(data);
}

export async function listConversations(scope: { userId:string;organizationId:string }, limit=40) {
  const { data,error } = await supabaseAdmin.from('ai_conversations').select('*')
    .eq('user_id',scope.userId).eq('organization_id',scope.organizationId).is('deleted_at',null)
    .order('last_message_at',{ ascending:false }).limit(Math.min(100,Math.max(1,limit)));
  if (error) throw new ConversationError('database_unavailable','Conversations could not be loaded');
  return (data ?? []).map(summary);
}

export async function getConversation(scope: { userId:string;organizationId:string }, conversationId:string) {
  const { data,error } = await supabaseAdmin.from('ai_conversations').select('*')
    .eq('id',conversationId).eq('user_id',scope.userId).eq('organization_id',scope.organizationId)
    .is('deleted_at',null).maybeSingle();
  if (error) throw new ConversationError('database_unavailable','Conversation could not be loaded');
  if (!data) throw new ConversationError('not_found','Conversation not found');
  return summary(data);
}

export async function updateConversationTitle(scope: { userId:string;organizationId:string },conversationId:string,title:string) {
  const normalized=title.trim().slice(0,120);
  if (!normalized) throw new ConversationError('conflict','Title is required');
  const { data,error } = await supabaseAdmin.from('ai_conversations').update({ title:normalized,updated_at:new Date().toISOString() })
    .eq('id',conversationId).eq('user_id',scope.userId).eq('organization_id',scope.organizationId)
    .is('deleted_at',null).select('*').maybeSingle();
  if (error) throw new ConversationError('database_unavailable','Conversation could not be updated');
  if (!data) throw new ConversationError('not_found','Conversation not found');
  return summary(data);
}

export async function deleteConversation(scope: { userId:string;organizationId:string },conversationId:string) {
  const now=new Date().toISOString();
  const { data,error } = await supabaseAdmin.from('ai_conversations').update({ deleted_at:now,updated_at:now })
    .eq('id',conversationId).eq('user_id',scope.userId).eq('organization_id',scope.organizationId)
    .is('deleted_at',null).select('id').maybeSingle();
  if (error) throw new ConversationError('database_unavailable','Conversation could not be deleted');
  if (!data) throw new ConversationError('not_found','Conversation not found');
}

export async function reserveChatRun(scope:{userId:string;organizationId:string},conversationId:string,requestKey:string) {
  const { data,error } = await supabaseAdmin.rpc('reserve_ai_chat_run',{
    p_request_key:requestKey,p_conversation_id:conversationId,p_user_id:scope.userId,
    p_organization_id:scope.organizationId,p_user_limit:aiChatLimits.userConcurrency,
    p_org_limit:aiChatLimits.organizationConcurrency,p_lease_seconds:90,
  });
  if (error) throw new ConversationError('database_unavailable','Chat concurrency control is unavailable');
  const row=Array.isArray(data)?data[0]:data;
  if (!row?.allowed) throw new ConversationError('conflict',row?.reason === 'user_concurrency_limit'
    ? 'Please wait for your other response to finish' : 'AI is busy for this workspace; please retry shortly');
  return { runId:String(row.run_id),duplicate:Boolean(row.duplicate) };
}

export async function finishChatRun(runId:string,userId:string,status:'completed'|'failed'|'cancelled') {
  await supabaseAdmin.rpc('finish_ai_chat_run',{ p_run_id:runId,p_user_id:userId,p_status:status });
}

export async function createTurnMessages(scope:{userId:string;organizationId:string},conversationId:string,requestId:string,content:string) {
  const existing = await supabaseAdmin.from('ai_messages').select('*')
    .eq('conversation_id',conversationId).eq('client_request_id',requestId).order('sequence_number');
  if (existing.error) throw new ConversationError('database_unavailable','Chat messages could not be checked');
  if ((existing.data?.length ?? 0) >= 2) {
    return {
      duplicate:true,userMessageId:String(existing.data![0].id),assistantMessageId:String(existing.data![1].id),
      assistantStatus:String(existing.data![1].status),assistantContent:String(existing.data![1].content),
    };
  }
  const now=new Date().toISOString();
  const { data,error }=await supabaseAdmin.from('ai_messages').insert([
    { conversation_id:conversationId,organization_id:scope.organizationId,user_id:scope.userId,
      client_request_id:requestId,role:'user',status:'completed',content,completed_at:now },
    { conversation_id:conversationId,organization_id:scope.organizationId,user_id:scope.userId,
      client_request_id:requestId,role:'assistant',status:'streaming',content:'' },
  ]).select('*').order('sequence_number');
  if (error) {
    // Concurrent retry with the same client request id: the unique constraint is
    // authoritative. Re-read instead of creating a second turn.
    if (error.code === '23505') {
      const retry=await supabaseAdmin.from('ai_messages').select('*')
        .eq('conversation_id',conversationId).eq('client_request_id',requestId).order('sequence_number');
      if (!retry.error && (retry.data?.length ?? 0)>=2) return {
        duplicate:true,userMessageId:String(retry.data![0].id),assistantMessageId:String(retry.data![1].id),
        assistantStatus:String(retry.data![1].status),assistantContent:String(retry.data![1].content),
      };
    }
    throw new ConversationError('database_unavailable','Chat messages could not be created');
  }
  if (!data || data.length!==2) throw new ConversationError('database_unavailable','Chat messages could not be created');
  await supabaseAdmin.from('ai_conversations').update({
    last_message_at:now,updated_at:now,
    ...(content.length ? { title:content.trim().replace(/\s+/g,' ').slice(0,72) } : {}),
  }).eq('id',conversationId).eq('title','New conversation');
  return { duplicate:false,userMessageId:String(data[0].id),assistantMessageId:String(data[1].id),assistantStatus:'streaming',assistantContent:'' };
}

export async function finalizeAssistantMessage(input:{
  messageId:string;scope:{userId:string;organizationId:string};content:string;
  status:'completed'|'failed'|'cancelled';model?:string;inputTokens?:number;outputTokens?:number;
  errorCode?:string;sources?:SourceCitation[];grounding?:{
    kind:'none'|'knowledge'|'structured';teamId?:string;processId?:string;
  };
}) {
  const grounding=input.grounding ?? { kind:'none' as const };
  const { data,error }=await supabaseAdmin.rpc('finalize_ai_chat_message',{
    p_message_id:input.messageId,p_user_id:input.scope.userId,p_organization_id:input.scope.organizationId,
    p_content:input.content,p_status:input.status,p_model:input.model ?? null,
    p_input_tokens:input.inputTokens ?? null,p_output_tokens:input.outputTokens ?? null,
    p_error_code:input.errorCode ?? null,p_sources:input.sources ?? [],
    p_grounding_kind:grounding.kind,p_grounding_team_id:grounding.teamId ?? null,
    p_grounding_project_id:grounding.processId ?? null,
  });
  if (error || data!==true) throw new ConversationError('database_unavailable','Assistant response could not be saved');
}

export async function getConversationMessages(scope:{userId:string;organizationId:string},conversationId:string):Promise<AIChatMessage[]> {
  await getConversation(scope,conversationId);
  const { data:messages,error }=await supabaseAdmin.from('ai_messages').select('*')
    .eq('conversation_id',conversationId).eq('user_id',scope.userId).eq('organization_id',scope.organizationId)
    .order('sequence_number',{ ascending:true }).limit(300);
  if (error) throw new ConversationError('database_unavailable','Messages could not be loaded');
  const ids=(messages ?? []).map((message:any)=>String(message.id));
  const assistantIds=(messages ?? []).filter((message:any)=>message.role==='assistant').map((message:any)=>String(message.id));
  let validMessageIds=new Set<string>();
  if (assistantIds.length) {
    const { data,error:messageAccessError }=await supabaseAdmin.rpc('ai_validate_chat_message_access',{
      p_user_id:scope.userId,p_message_ids:assistantIds,
    });
    if (messageAccessError) throw new ConversationError('database_unavailable','Message access could not be validated');
    validMessageIds=new Set((data ?? []).map((row:any)=>String(row.message_id)));
  }
  const { data:sourceRows,error:sourceError }=ids.length
    ? await supabaseAdmin.from('ai_message_sources').select('*').in('message_id',ids)
    : { data:[],error:null };
  if (sourceError) throw new ConversationError('database_unavailable','Message sources could not be loaded');
  const chunkIds=[...new Set((sourceRows ?? []).map((row:any)=>String(row.chunk_id)))];
  let validIds=new Set<string>();
  if (chunkIds.length) {
    const { data,error:validationError }=await supabaseAdmin.rpc('ai_validate_retrieval_chunks',{
      p_user_id:scope.userId,p_chunk_ids:chunkIds,
      p_index_version:process.env.AI_RETRIEVAL_INDEX_VERSION ?? process.env.AI_INDEX_VERSION ?? 'bge-m3-v1',
    });
    if (validationError) throw new ConversationError('database_unavailable','Source access could not be validated');
    validIds=new Set((data ?? []).map((row:any)=>String(row.chunk_id)));
  }
  const sourcesByMessage=new Map<string,SourceCitation[]>();
  const invalidSourceMessages=new Set<string>();
  for (const row of sourceRows ?? []) {
    const messageId=String(row.message_id),chunkId=String(row.chunk_id);
    if (!validIds.has(chunkId)) { invalidSourceMessages.add(messageId); continue; }
    const parsed=citationSnapshotSchema.safeParse(row.citation);
    if (!parsed.success) continue;
    const values=sourcesByMessage.get(messageId) ?? [];
    values.push(parsed.data as SourceCitation);sourcesByMessage.set(messageId,values);
  }
  return (messages ?? []).map((message:any)=>{
    const revoked=message.role==='assistant' && (
      !validMessageIds.has(String(message.id)) || invalidSourceMessages.has(String(message.id))
    );
    return {
      id:String(message.id),role:message.role,content:revoked
        ? 'This source-backed response is no longer available because your source access changed.'
        : String(message.content),status:message.status,model:message.model ? String(message.model) : null,
      createdAt:String(message.created_at),sources:revoked ? [] : (sourcesByMessage.get(String(message.id)) ?? []),
      ...(revoked ? { sourceAccessRevoked:true } : {}),
    };
  });
}

export function historyForProvider(messages:AIChatMessage[]) {
  const completed=messages.filter((message)=>message.status==='completed' && !message.sourceAccessRevoked)
    .slice(-aiChatLimits.maxHistoryMessages);
  // Token-aware selection happens after intent and retrieved sources are known.
  // This function only applies a hard message-count safety cap.
  return completed.map((message)=>({ role:message.role,content:message.content } as const));
}
