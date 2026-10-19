import { randomUUID } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { GroqChatProvider } from '@/lib/ai/providers/groq-chat-provider';
import { createRequestSignal } from '@/lib/ai/providers/provider-http';
import { retrieveKnowledge } from '@/lib/ai/retrieval/retrieval-server';
import { retrieveStructuredActions } from '@/lib/ai/retrieval/structured-retrieval-server';
import { createCitationRegistry } from '@/lib/ai/retrieval/citation';
import { releaseAIQuotaReservation,reserveAIQuota,recordAIRequest } from '@/lib/ai/utils/rate-limiter';
import { aiChatLimits,isAIChatRuntimeReady,areAIActionMutationToolsEnabled,areAIReadToolsEnabled,areAIWriteToolsEnabled } from '@/lib/ai/chat/config';
import { citationIdsFromAnswer,sanitizeAnswerCitations } from '@/lib/ai/chat/citations';
import { classifyChatIntent,fixedProductHelp,shouldAttemptKnowledgeRetrieval } from '@/lib/ai/chat/intent';
import { chatRetrievalLimit,planChatContext } from '@/lib/ai/chat/context-budget';
import { finalizeGroqTokens,reserveGroqTokens } from '@/lib/ai/chat/provider-token-admission';
import { formatAIQuotaMessage,shouldRefundAIUserQuota } from '@/lib/ai/chat/quota-policy';
import {
  createTurnMessages,finalizeAssistantMessage,finishChatRun,getConversation,
  getConversationMessages,historyForProvider,reserveChatRun,
} from '@/lib/ai/chat/conversation-server';
import { chatErrorResponse,requireAIChatUser } from '@/lib/ai/chat/http-server';
import type { AIChatStreamEvent } from '@/lib/ai/chat/types';
import { encodeChatSSE } from '@/lib/ai/chat/sse';
import { buildAIReadToolContext } from '@/lib/ai/agent/context';
import { executeAIReadTool,AIReadToolError } from '@/lib/ai/agent/read-tools';
import { planDirectAIReadTools,shouldUseModelToolSelection } from '@/lib/ai/agent/router';
import { selectAIReadTools } from '@/lib/ai/agent/selector';
import type { AIReadReference,AIReadToolCall,AIReadToolExecution } from '@/lib/ai/agent/types';
import { shouldPlanAIWrite,selectAIWriteProposal } from '@/lib/ai/agent/write-selector';
import { createAIWriteProposal,AIWriteProposalError } from '@/lib/ai/agent/write-proposals-server';
import { getUserSchedulingTimeZone } from '@/lib/scheduling-runtime-server';

export const runtime='nodejs';
export const maxDuration=60;

const requestSchema=z.object({
  conversationId:z.string().uuid(),clientRequestId:z.string().uuid(),
  message:z.string().trim().min(1).max(aiChatLimits.maxMessageChars),
  context:z.object({ origin:z.enum(['global','knowledge_hub']).default('global'),
    teamId:z.string().uuid().optional(),processId:z.string().uuid().optional() }).strict().default({ origin:'global' }),
}).strict();

const encoder=new TextEncoder();
const encode=(event:AIChatStreamEvent)=>encoder.encode(encodeChatSSE(event));
const READ_TOOL_TIMEOUT_MS=10_000;

function dateInTimeZone(timeZone:string):string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date());
  const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find((part)=>part.type===type)?.value??'';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function executeReadToolWithTimeout(call:AIReadToolCall,actor:{userId:string;organizationId:string;role?:string|null}) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([
      executeAIReadTool(call.name,call.arguments,actor),
      new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(
        new AIReadToolError('unavailable','Axiom data lookup timed out'),
      ),READ_TOOL_TIMEOUT_MS);}),
    ]);
  } finally { if(timer)clearTimeout(timer); }
}

function safeError(error:unknown,provider?:GroqChatProvider) {
  if (error instanceof Error && error.name==='AbortError') return { code:'CANCELLED',message:'Generation stopped',retryable:true };
  if (error instanceof Error && error.name==='CitationRequiredError') return {
    code:'CITATION_REQUIRED',message:'Axiom AI could not verify a source citation. Please retry.',retryable:true,
  };
  if (error instanceof AIWriteProposalError) return {
    code:`WRITE_PROPOSAL_${error.code.toUpperCase()}`,
    message:error.message,retryable:error.code==='unavailable',
  };
  if (provider) {
    const normalized=provider.normalizeError(error);
    if (normalized.code==='rate_limited') {
      const retryAfterSeconds=normalized.retryAfterMs?Math.max(1,Math.ceil(normalized.retryAfterMs/1_000)):undefined;
      return { code:'PROVIDER_RATE_LIMITED',message:retryAfterSeconds
        ? `The Groq request limit was reached. Try again in about ${retryAfterSeconds} seconds.`
        : 'The Groq request limit was reached. Please retry shortly.',retryable:true,retryAfterSeconds };
    }
    if (normalized.code==='timeout') return { code:'PROVIDER_TIMEOUT',message:'The response took too long. Please retry.',retryable:true };
    if (normalized.code==='configuration') return { code:'PROVIDER_CONFIGURATION',message:'Axiom AI provider is not configured.',retryable:false };
  }
  return { code:'AI_UNAVAILABLE',message:'Axiom AI could not complete this response. Please retry.',retryable:true };
}

export async function POST(request:NextRequest) {
  const scope=await requireAIChatUser(); if (scope instanceof NextResponse) return scope;
  if (!isAIChatRuntimeReady()) {
    return NextResponse.json({ error:{ code:'CHAT_NOT_READY',message:'Axiom AI requires verified provider and atomic quota configuration' } },{ status:503 });
  }
  const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ error:{ code:'INVALID_REQUEST',message:'Invalid chat request' } },{ status:400 });
  const input=parsed.data;
  try {
    const conversation=await getConversation(scope,input.conversationId);
    // Context supplied by the browser can only narrow retrieval and never grants access.
    const effectiveContext={ ...conversation.context,...input.context };
    const availableHistory=historyForProvider(await getConversationMessages(scope,input.conversationId));
    const run=await reserveChatRun(scope,input.conversationId,input.clientRequestId);
    const turn=await createTurnMessages(scope,input.conversationId,input.clientRequestId,input.message);
    if (turn.duplicate) {
      if (turn.assistantStatus!=='completed') {
        return NextResponse.json({ error:{ code:'REQUEST_IN_PROGRESS',message:'This message is already being processed' } },{ status:409 });
      }
    }

    const stream=new ReadableStream<Uint8Array>({
      async start(controller) {
        const startedAt=Date.now(); let answer=''; let assistantStatus:'completed'|'failed'|'cancelled'='failed';
        let inputTokens:number|undefined,outputTokens:number|undefined,model:string|undefined;
        let provider:GroqChatProvider|undefined,billableAttempt=false;
        let tokenReservationId:string|undefined;
        let quotaReserved=false;
        let retrievalLatencyMs:number|undefined,firstTokenMs:number|undefined;
        let citations:Awaited<ReturnType<typeof retrieveKnowledge>>['citations']=[];
        let readToolExecutions:AIReadToolExecution[]=[];let readToolReferences:AIReadReference[]=[];
        let agentContext:string|undefined;let usedModelToolSelection=false;
        let grounding:{ kind:'none'|'knowledge'|'structured';teamId?:string;processId?:string }={ kind:'none' };
        const overallSignal=createRequestSignal(aiChatLimits.timeoutMs,request.signal);
        const send=(event:AIChatStreamEvent)=>controller.enqueue(encode(event));
        try {
          send({ type:'meta',conversationId:input.conversationId,userMessageId:turn.userMessageId,assistantMessageId:turn.assistantMessageId });
          if (turn.duplicate && turn.assistantStatus==='completed') {
            send({ type:'delta',text:turn.assistantContent });send({ type:'done',finishReason:'completed' });
            assistantStatus='completed';return;
          }

          const intent=classifyChatIntent(input.message);
          const actionMutationToolsEnabled=areAIActionMutationToolsEnabled();
          const writeRequested=areAIWriteToolsEnabled()&&shouldPlanAIWrite(input.message,actionMutationToolsEnabled);
          const fixed=intent==='product_help' ? fixedProductHelp(input.message) : null;
          if (fixed) {
            answer=fixed;send({ type:'delta',text:answer });assistantStatus='completed';
            await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model:'axiom-help-static' });
            send({ type:'done',finishReason:'completed' });return;
          }

          const readToolsEnabled=areAIReadToolsEnabled();
          const directReadToolCalls=readToolsEnabled&&!writeRequested?planDirectAIReadTools(input.message,effectiveContext):[];
          const needsModelToolSelection=readToolsEnabled&&!writeRequested&&shouldUseModelToolSelection(input.message,directReadToolCalls);
          const runReadToolCalls=async(calls:AIReadToolCall[])=>{
            const executions:AIReadToolExecution[]=[];
            for(const call of calls.slice(0,2)) {
              send({type:'tool_status',label:'Axiom verileri kontrol ediliyor…'});
              try { executions.push(await executeReadToolWithTimeout(call,{
                userId:scope.userId,organizationId:scope.organizationId,role:scope.role,
              })); }
              catch(error) {
                if(!(error instanceof AIReadToolError)) throw error;
                executions.push({name:call.name,statusLabel:'Axiom verileri kontrol ediliyor…',citations:[],references:[],
                  data:{error:error.code,message:error.message}});
              }
            }
            return executions;
          };
          if(directReadToolCalls.length) {
            readToolExecutions=await runReadToolCalls(directReadToolCalls);
            citations=readToolExecutions.flatMap((execution)=>execution.citations);
            readToolReferences=readToolExecutions.flatMap((execution)=>execution.references)
              .filter((reference,index,all)=>all.findIndex((candidate)=>candidate.type===reference.type&&candidate.id===reference.id)===index).slice(0,20);
            agentContext=buildAIReadToolContext(readToolExecutions.filter((execution)=>execution.name!=='search_knowledge'))||undefined;
            if(readToolReferences.length)send({type:'references',references:readToolReferences});
            grounding=citations.length?{kind:'knowledge',teamId:effectiveContext.teamId,processId:effectiveContext.processId}
              :readToolReferences.length?{kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId}:{kind:'none'};
          }

          let structured:Awaited<ReturnType<typeof retrieveStructuredActions>>|undefined;
          const shouldRetrieve=!writeRequested&&!directReadToolCalls.length&&!needsModelToolSelection&&shouldAttemptKnowledgeRetrieval(input.message,intent);
          if (shouldRetrieve) {
            try {
              const result=await retrieveKnowledge({ query:input.message,mode:'hybrid',limit:chatRetrievalLimit(input.message),
                similarityThreshold:intent==='knowledge' ? 0.2 : 0.5,
                teamId:effectiveContext.teamId,processId:effectiveContext.processId,
                timeoutMs:Math.min(15_000,aiChatLimits.timeoutMs),signal:overallSignal.signal });
              retrievalLatencyMs=result.latencyMs;
              citations=result.citations;
            } catch (error) {
              // Opportunistic retrieval must not break ordinary conversation.
              // Explicit workspace questions remain fail-closed.
              if (intent==='knowledge') throw error;
              console.warn(JSON.stringify({ event:'ai_chat_optional_retrieval_failed',
                requestId:input.clientRequestId }));
            }
            if (intent==='knowledge' && citations.length===0) {
              answer='Your Axiom knowledge index does not contain an accessible match yet. Once indexing is enabled and current, I can answer this with verified sources.';
              send({ type:'delta',text:answer });assistantStatus='completed';
              await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model:'axiom-index-status' });
              send({ type:'done',finishReason:'completed' });return;
            }
            if (citations.length>0) grounding={ kind:'knowledge',teamId:effectiveContext.teamId,processId:effectiveContext.processId };
          } else if (!writeRequested&&!readToolExecutions.length&&!needsModelToolSelection&&intent==='structured') {
            if (!effectiveContext.teamId) {
              answer='Choose a team or open Axiom AI from Knowledge Hub so I can answer this structured question from canonical Action data.';
              send({ type:'delta',text:answer });assistantStatus='completed';
              await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model:'axiom-scope-guard' });
              send({ type:'done',finishReason:'completed' });return;
            }
            structured=await retrieveStructuredActions({ teamId:effectiveContext.teamId,
              processId:effectiveContext.processId,limit:100,order:'updated_desc' });
            grounding={ kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId };
          }

          const contextPlan=planChatContext({ intent,question:input.message,history:availableHistory,
            citations,structured,agentContext,configuredMaxOutputTokens:aiChatLimits.maxOutputTokens });
          const quota=await reserveAIQuota(scope.userId,scope.organizationId,'axiom-chat',input.clientRequestId);
          if (!quota.allowed) {
            const errorEvent={ type:'error',code:'QUOTA_EXHAUSTED',
              message:formatAIQuotaMessage(quota.reason,quota.resetAt),retryable:false } as const;
            send(errorEvent);await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:'',status:'failed',errorCode:errorEvent.code });
            assistantStatus='failed';return;
          }
          quotaReserved=Boolean(quota.reservationId);

          provider=new GroqChatProvider(); model=provider.modelId;

          const tokenAdmission=await reserveGroqTokens({ requestKey:input.clientRequestId,userId:scope.userId,
            organizationId:scope.organizationId,model,
            estimatedInputTokens:contextPlan.estimatedInputTokens+(writeRequested?1_200:0),
            maxOutputTokens:contextPlan.maxOutputTokens+(needsModelToolSelection?3_500:0)+(writeRequested?500:0) });
          tokenReservationId=tokenAdmission.reservationId;
          if (!tokenAdmission.allowed) {
            const retryAfterSeconds=tokenAdmission.retryAfterSeconds??60;
            const errorEvent={ type:'error',code:'PROVIDER_TOKEN_BUDGET',
              message:`Axiom AI is protecting the Groq minute limit. Try again in about ${retryAfterSeconds} seconds.`,
              retryable:true,retryAfterSeconds } as const;
            if (quotaReserved) await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
            quotaReserved=false;
            send(errorEvent);await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:'',
              status:'failed',errorCode:errorEvent.code });assistantStatus='failed';return;
          }

          let finalContextPlan=contextPlan;
          if(writeRequested) {
            billableAttempt=true;
            send({type:'tool_status',label:'İşlem taslağı hazırlanıyor…'});
            const writeTimeZone=actionMutationToolsEnabled?await getUserSchedulingTimeZone(scope.userId):undefined;
            const selection=await selectAIWriteProposal({provider,question:input.message,history:availableHistory,
              signal:overallSignal.signal,timeoutMs:aiChatLimits.timeoutMs,
              includeActionMutations:actionMutationToolsEnabled,timeZone:writeTimeZone,
              localDate:writeTimeZone?dateInTimeZone(writeTimeZone):undefined});
            inputTokens=(inputTokens??0)+selection.inputTokens;outputTokens=(outputTokens??0)+selection.outputTokens;
            if(selection.call) {
              console.info(JSON.stringify({event:'ai_write_proposal_selected',requestId:input.clientRequestId,
                toolName:selection.call.name}));
              const proposalArguments=selection.call.name==='create_action'&&effectiveContext.processId
                ? {...(selection.call.arguments as object),processId:(selection.call.arguments as any)?.processId??effectiveContext.processId}
                : selection.call.arguments;
              const proposal=await createAIWriteProposal(selection.call.name,proposalArguments,{
                userId:scope.userId,organizationId:scope.organizationId,role:scope.role,
                conversationId:input.conversationId,assistantMessageId:turn.assistantMessageId,userRequest:input.message,
              });
              answer='İşlem taslağını hazırladım. Axiom verilerinde hiçbir değişiklik yapılmadı; yalnızca aşağıdaki Onayla düğmesi işlemi gerçekleştirebilir.';
              await finalizeAssistantMessage({messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model,
                inputTokens,outputTokens,grounding:{kind:'none'}});
              send({type:'proposal',proposal});send({type:'delta',text:answer});send({type:'done',finishReason:'completed'});
              assistantStatus='completed';
              await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model,inputTokens??0,outputTokens??0,
                0,Date.now()-startedAt,true,undefined,{intent,writeProposalTool:selection.call.name,writeExecuted:false});
              return;
            }
          }
          if(needsModelToolSelection) {
            billableAttempt=true;usedModelToolSelection=true;
            const selection=await selectAIReadTools({provider,question:input.message,history:availableHistory,
              signal:overallSignal.signal,timeoutMs:aiChatLimits.timeoutMs});
            inputTokens=(inputTokens??0)+selection.inputTokens;outputTokens=(outputTokens??0)+selection.outputTokens;
            if(selection.calls.length) {
              readToolExecutions=await runReadToolCalls(selection.calls);
              citations=readToolExecutions.flatMap((execution)=>execution.citations);
              readToolReferences=readToolExecutions.flatMap((execution)=>execution.references)
                .filter((reference,index,all)=>all.findIndex((candidate)=>candidate.type===reference.type&&candidate.id===reference.id)===index).slice(0,20);
              agentContext=buildAIReadToolContext(readToolExecutions.filter((execution)=>execution.name!=='search_knowledge'))||undefined;
              if(readToolReferences.length)send({type:'references',references:readToolReferences});
              grounding=citations.length?{kind:'knowledge',teamId:effectiveContext.teamId,processId:effectiveContext.processId}
                :readToolReferences.length?{kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId}:{kind:'none'};
              finalContextPlan=planChatContext({intent,question:input.message,history:availableHistory,citations,
                agentContext,configuredMaxOutputTokens:aiChatLimits.maxOutputTokens});
            }
          }
          citations=finalContextPlan.citations;

          billableAttempt=true;
          const registry=createCitationRegistry(citations);
          const events=provider.stream({ messages:finalContextPlan.messages,
            temperature:0.25,maxOutputTokens:finalContextPlan.maxOutputTokens,
            reasoning:{ effort:finalContextPlan.profile==='general'&&model.startsWith('qwen/')?'none':'low',format:'hidden' } },
            { requestId:randomUUID(),timeoutMs:aiChatLimits.timeoutMs,signal:overallSignal.signal });
          for await (const event of events) {
            if (event.type==='text_delta') {
              if (firstTokenMs===undefined) firstTokenMs=Date.now()-startedAt;
              answer+=event.text;send({ type:'delta',text:event.text });
            }
            else if (event.type==='usage') {
              inputTokens=(inputTokens??0)+(event.usage.inputTokens??0);outputTokens=(outputTokens??0)+(event.usage.outputTokens??0);
              send({ type:'usage',inputTokens,outputTokens });
            }
          }
          const allowed=new Set(registry.ids);
          answer=sanitizeAnswerCitations(answer,allowed);
          const referenced=citationIdsFromAnswer(answer);
          const verified=referenced.length ? registry.validate(referenced) : [];
          if (grounding.kind==='knowledge' && verified.length===0) {
            const error=new Error('Knowledge response omitted its required verified citation');
            error.name='CitationRequiredError';
            throw error;
          }
          await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model,
            inputTokens,outputTokens,sources:verified,
            ...(readToolReferences.length?{references:readToolReferences}:{}),grounding });
          if (verified.length) send({ type:'sources',sources:verified });
          send({ type:'done',finishReason:'completed' });assistantStatus='completed';
          await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model,inputTokens ?? 0,outputTokens ?? 0,
            0,Date.now()-startedAt,true,undefined,{ intent,citationCount:verified.length,
              retrievalSourceCount:citations.length,retrievalLatencyMs,firstTokenMs,
              contextProfile:finalContextPlan.profile,estimatedInputTokens:finalContextPlan.estimatedInputTokens,
              maxOutputTokens:finalContextPlan.maxOutputTokens,droppedHistoryMessages:finalContextPlan.droppedHistoryMessages,
              droppedCitations:finalContextPlan.droppedCitations,droppedStructuredActions:finalContextPlan.droppedStructuredActions,
              readTools:readToolExecutions.map((execution)=>execution.name),toolCallCount:readToolExecutions.length,
              modelToolSelection:usedModelToolSelection });
        } catch(error) {
          const cancelled=request.signal.aborted || (error instanceof Error && error.name==='AbortError');
          assistantStatus=cancelled?'cancelled':'failed';
          const normalized=safeError(error,provider);
          const providerFailure=provider?.normalizeError(error);
          let userQuotaRefunded=false;
          if (quotaReserved&&shouldRefundAIUserQuota({ billableAttempt,errorCode:normalized.code })) {
            await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
            quotaReserved=false;
            userQuotaRefunded=true;
          }
          console.error(JSON.stringify({ event:'ai_chat_failed',requestId:input.clientRequestId,code:normalized.code,
            durationMs:Date.now()-startedAt,retryable:normalized.retryable,
            providerStatus:providerFailure?.providerStatus,retryAfterMs:providerFailure?.retryAfterMs,
            upstreamRequestId:providerFailure?.upstreamRequestId,rateLimit:providerFailure?.rateLimit }));
          try { await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer||normalized.message,
            status:assistantStatus,model,inputTokens,outputTokens,errorCode:normalized.code,
            sources:[],...(readToolReferences.length?{references:readToolReferences}:{}),grounding }); } catch { /* lease recovery remains */ }
          if (billableAttempt) await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model ?? 'groq',
            inputTokens ?? 0,outputTokens ?? 0,0,Date.now()-startedAt,false,normalized.code,
            { failed:true,userQuotaRefunded });
          try { send({ type:'error',...normalized }); } catch { /* disconnected client */ }
        } finally {
          overallSignal.cleanup();
          await finalizeGroqTokens({ reservationId:tokenReservationId,userId:scope.userId,status:assistantStatus,
            actualTokens:inputTokens!==undefined||outputTokens!==undefined?(inputTokens??0)+(outputTokens??0):undefined }).catch(()=>undefined);
          await finishChatRun(run.runId,scope.userId,assistantStatus).catch(()=>undefined);
          try { controller.close(); } catch { /* already closed */ }
        }
      },
      cancel() { /* request.signal drives provider cancellation; run lease is the crash fallback. */ },
    });
    return new Response(stream,{ headers:{
      'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform',
      Connection:'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff',
    } });
  } catch(error) { return chatErrorResponse(error); }
}
