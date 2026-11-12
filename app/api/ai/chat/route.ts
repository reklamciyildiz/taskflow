import { randomUUID } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { GroqChatProvider } from '@/lib/ai/providers/groq-chat-provider';
import { readToolSelectorMaxOutputTokens } from '@/lib/ai/providers/model-reasoning-compat';
import { createRequestSignal,abortableDelay } from '@/lib/ai/providers/provider-http';
import { retrieveKnowledge } from '@/lib/ai/retrieval/retrieval-server';
import { retrieveStructuredActions } from '@/lib/ai/retrieval/structured-retrieval-server';
import { createCitationRegistry } from '@/lib/ai/retrieval/citation';
import { releaseAIQuotaReservation,reserveAIQuota,recordAIRequest } from '@/lib/ai/utils/rate-limiter';
import { aiChatLimits,isAIChatRuntimeReady,areAIActionMutationToolsEnabled,areAIReadToolsEnabled,areAIWriteToolsEnabled } from '@/lib/ai/chat/config';
import { citationIdsFromAnswer,sanitizeAnswerCitations } from '@/lib/ai/chat/citations';
import { classifyChatIntent,fixedProductHelp,shouldAttemptKnowledgeRetrieval } from '@/lib/ai/chat/intent';
import { inferAIChatLanguage } from '@/lib/ai/chat/language';
import { chatRetrievalLimit,planChatContext } from '@/lib/ai/chat/context-budget';
import { finalizeGroqTokens,reserveGroqTokens,reserveProviderTokens,backupTokenBudget } from '@/lib/ai/chat/provider-token-admission';
import { createOptionalOpenAIBackup } from '@/lib/ai/chat/backup-provider';
import { selectChatModel } from '@/lib/ai/chat/model-router';
import { admissionRetryDelayMs } from '@/lib/ai/chat/provider-capacity-policy';
import { AI_RETRYING_MESSAGE, AI_TEMPORARY_CAPACITY_MESSAGE, AI_TEMPORARY_SERVICE_MESSAGE,
  mayFailOverBeforeResponse, shortRetryDelayMs } from '@/lib/ai/chat/reliability-policy';
import { formatAIQuotaMessage,shouldRefundAIUserQuota } from '@/lib/ai/chat/quota-policy';
import {
  claimFailedAssistantForRetry,createTurnMessages,finalizeAssistantMessage,finishChatRun,getConversation,
  getConversationMessages,historyForProvider,reserveChatRun,
} from '@/lib/ai/chat/conversation-server';
import { chatErrorResponse,requireAIChatUser } from '@/lib/ai/chat/http-server';
import type { AIChatStreamEvent } from '@/lib/ai/chat/types';
import { encodeChatSSE } from '@/lib/ai/chat/sse';
import { buildAIReadToolContext } from '@/lib/ai/agent/context';
import { renderCanonicalWorkspaceAnswer } from '@/lib/ai/agent/canonical-answer';
import { executeAIReadTool,AIReadToolError } from '@/lib/ai/agent/read-tools';
import { planDirectAIReadTools,shouldUseModelToolSelection } from '@/lib/ai/agent/router';
import { selectAIReadTools,estimateAIReadToolSelectionTokens } from '@/lib/ai/agent/selector';
import type { AIReadReference,AIReadToolCall,AIReadToolExecution } from '@/lib/ai/agent/types';
import { shouldPlanAIWrite,selectAIWriteProposal } from '@/lib/ai/agent/write-selector';
import { createAIWriteProposal,AIWriteProposalError } from '@/lib/ai/agent/write-proposals-server';
import { getUserSchedulingTimeZone } from '@/lib/scheduling-runtime-server';
import { aiAllowanceForAuthenticatedOrganization } from '@/lib/ai/chat/plan-access-server';
import { estimateGroqChatCostUsd } from '@/lib/ai/chat/plan-policy';

export const runtime='nodejs';
export const maxDuration=60;

const requestSchema=z.object({
  conversationId:z.string().uuid(),clientRequestId:z.string().uuid(),
  retryAssistantMessageId:z.string().uuid().optional(),
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
        new AIReadToolError('unavailable','Actiproc data lookup timed out'),
      ),READ_TOOL_TIMEOUT_MS);}),
    ]);
  } finally { if(timer)clearTimeout(timer); }
}

function safeError(error:unknown,provider?:GroqChatProvider) {
  if (error instanceof Error && error.name==='AbortError') return { code:'CANCELLED',message:'Generation stopped',retryable:true };
  if (error instanceof Error && error.name==='CitationRequiredError') return {
    code:'CITATION_REQUIRED',message:'Actiproc AI could not verify a source citation. Please retry.',retryable:true,
  };
  if (error instanceof AIWriteProposalError) return {
    code:`WRITE_PROPOSAL_${error.code.toUpperCase()}`,
    message:error.message,retryable:error.code==='unavailable',
  };
  if (provider) {
    const normalized=provider.normalizeError(error);
    if (normalized.code==='rate_limited') {
      const retryAfterSeconds=normalized.retryAfterMs?Math.max(1,Math.ceil(normalized.retryAfterMs/1_000)):undefined;
      return { code:'PROVIDER_RATE_LIMITED',message:AI_TEMPORARY_CAPACITY_MESSAGE,
        retryable:true,retryAfterSeconds };
    }
    if (normalized.code==='timeout') return { code:'PROVIDER_TIMEOUT',message:AI_TEMPORARY_SERVICE_MESSAGE,retryable:true };
    if (normalized.code==='configuration') return { code:'PROVIDER_CONFIGURATION',message:AI_TEMPORARY_SERVICE_MESSAGE,retryable:false };
    if (normalized.code==='invalid_request') return { code:'PROVIDER_REQUEST_REJECTED',message:AI_TEMPORARY_SERVICE_MESSAGE,retryable:false };
    if (normalized.code==='unauthorized') return { code:'PROVIDER_AUTHENTICATION',message:AI_TEMPORARY_SERVICE_MESSAGE,retryable:false };
    if (normalized.code==='unavailable') return { code:'PROVIDER_UNAVAILABLE',message:AI_TEMPORARY_SERVICE_MESSAGE,retryable:true };
  }
  return { code:'AI_UNAVAILABLE',message:AI_TEMPORARY_SERVICE_MESSAGE,retryable:true };
}

export async function POST(request:NextRequest) {
  const scope=await requireAIChatUser(request); if (scope instanceof NextResponse) return scope;
  if (!isAIChatRuntimeReady()) {
    return NextResponse.json({ error:{ code:'CHAT_NOT_READY',message:'Actiproc AI requires verified provider and atomic quota configuration' } },{ status:503 });
  }
  const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ error:{ code:'INVALID_REQUEST',message:'Invalid chat request' } },{ status:400 });
  const input=parsed.data;
  let allowance: Awaited<ReturnType<typeof aiAllowanceForAuthenticatedOrganization>>;
  try {
    allowance=await aiAllowanceForAuthenticatedOrganization(scope.organizationId);
  } catch {
    return NextResponse.json({ error:{ code:'AI_ENTITLEMENT_UNAVAILABLE',
      message:'AI subscription limits could not be verified. Please try again shortly.' } },{ status:503 });
  }
  try {
    const conversation=await getConversation(scope,input.conversationId);
    // Context supplied by the browser can only narrow retrieval and never grants access.
    const effectiveContext={ ...conversation.context,...input.context };
    const availableHistory=historyForProvider(await getConversationMessages(scope,input.conversationId));
    const run=await reserveChatRun(scope,input.conversationId,input.clientRequestId);
    let turn:Awaited<ReturnType<typeof createTurnMessages>>;
    try {
      turn=input.retryAssistantMessageId
        ? await claimFailedAssistantForRetry(scope,input.conversationId,input.retryAssistantMessageId,input.message)
        : await createTurnMessages(scope,input.conversationId,input.clientRequestId,input.message);
    } catch (error) {
      // A rejected/concurrent retry must not retain a 90-second active lease.
      await finishChatRun(run.runId,scope.userId,'failed').catch(()=>undefined);
      throw error;
    }
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
        let failureStage='initialization';
        let tokenReservationId:string|undefined;
        let fallbackUsed=false;
        let fallbackStartingTokens=0;
        let definitelyNoNewProviderTokens=false;
        let sawStreamUsage=false;
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
          const replyInTurkish=inferAIChatLanguage(input.message)==='tr';
          const actionMutationToolsEnabled=areAIActionMutationToolsEnabled();
          const writeRequested=areAIWriteToolsEnabled()&&shouldPlanAIWrite(input.message,actionMutationToolsEnabled);
          const fixed=intent==='product_help' ? fixedProductHelp(input.message) : null;
          if (fixed) {
            answer=fixed;send({ type:'delta',text:answer });assistantStatus='completed';
            await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model:'axiom-help-static' });
            send({ type:'done',finishReason:'completed' });return;
          }

          // Reserve the atomic org/user quota BEFORE retrieval or model tool
          // selection. Otherwise a depleted/spamming user could still drive
          // billable embedding searches and costly database reads.
          const quota=await reserveAIQuota(scope.userId,scope.organizationId,'axiom-chat',input.clientRequestId,{
            dailyRequestsPerUser:allowance.dailyRequestsPerUser,
            monthlyRequestsPerOrg:allowance.monthlyRequestsPerOrg,
          });
          if (!quota.allowed) {
            const errorEvent={ type:'error',code:'QUOTA_EXHAUSTED',
              message:formatAIQuotaMessage(quota.reason,quota.resetAt),retryable:false } as const;
            send(errorEvent);await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:'',status:'failed',errorCode:errorEvent.code });
            assistantStatus='failed';return;
          }
          quotaReserved=Boolean(quota.reservationId);

          const readToolsEnabled=areAIReadToolsEnabled();
          // A data question must never be passed to an ungrounded model when
          // workspace read tools are administratively disabled.
          if(!readToolsEnabled&&!writeRequested) {
            const requested=planDirectAIReadTools(input.message,effectiveContext);
            if(requested.length||shouldUseModelToolSelection(input.message,[])) {
              answer=replyInTurkish
                ?'Bu oturumda Actiproc workspace veri okuma özelliği etkin değil. Action veya Note kayıtlarını doğrulayamadığım için sonuç uydurmayacağım. Yönetici AI Read Tools ayarını kontrol etmeli.'
                :'Workspace data reading is not enabled for this session. I cannot verify your Actions or Notes; an administrator should check the AI Read Tools configuration.';
              if(quotaReserved) {
                await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
                quotaReserved=false;
              }
              send({type:'delta',text:answer});assistantStatus='completed';
              await finalizeAssistantMessage({messageId:turn.assistantMessageId,scope,content:answer,
                status:'completed',model:'actiproc-read-tools-disabled'});
              send({type:'done',finishReason:'completed'});return;
            }
          }
          const directReadToolCalls=readToolsEnabled&&!writeRequested?planDirectAIReadTools(input.message,effectiveContext):[];
          if(directReadToolCalls.length)console.info(JSON.stringify({
            event:'ai_direct_workspace_read_planned',requestId:input.clientRequestId,
            readToolNames:directReadToolCalls.map(call=>call.name),
            scopedToTeam:Boolean(effectiveContext.teamId),scopedToProcess:Boolean(effectiveContext.processId),
          }));
          const needsModelToolSelection=readToolsEnabled&&!writeRequested
            &&shouldUseModelToolSelection(input.message,directReadToolCalls,effectiveContext);
          failureStage='workspace_read';
          const runReadToolCalls=async(calls:AIReadToolCall[])=>{
            const executions:AIReadToolExecution[]=[];
            for(const call of calls.slice(0,2)) {
              send({type:'tool_status',label:'Actiproc verileri kontrol ediliyor…'});
              try { executions.push(await executeReadToolWithTimeout(call,{
                userId:scope.userId,organizationId:scope.organizationId,role:scope.role,
              })); }
              catch(error) {
                if(!(error instanceof AIReadToolError)) throw error;
                executions.push({name:call.name,statusLabel:'Actiproc verileri kontrol ediliyor…',citations:[],references:[],
                  data:{error:error.code,message:error.message}});
              }
            }
            return executions;
          };
          if(directReadToolCalls.length) {
            readToolExecutions=await runReadToolCalls(directReadToolCalls);
            // A missing/inaccessible Process is NOT the same as a Process with
            // zero Actions. Do not ask the model to infer "0 records" from an
            // error-shaped tool result, and do not bill a model generation.
            const failedRead=readToolExecutions.find((execution)=>{
              const data=execution.data as { error?:string }|null;
              return data&&typeof data.error==='string';
            });
            if(failedRead) {
              const failure=failedRead.data as { error:string;message?:string };
              answer=failure.error==='not_found'
                ? failure.message?.startsWith('Process adı belirsiz:')
                  ? failure.message
                  : replyInTurkish
                    ? 'Belirttiğiniz Process bulunamadı veya bu Process için erişim izniniz yok. Lütfen tam adını yazın ya da ilgili Board üzerinden tekrar deneyin.'
                    : 'This Process was not found or is not accessible. Please provide its full name or open it from the Board.'
                :failure.error==='forbidden'
                  ? replyInTurkish?'Bu Process veya ekibin verilerine erişim izniniz yok.':'You do not have access to this Process or Team.'
                  : replyInTurkish
                    ? 'Actiproc verileri doğrulanamadı. Eksik içeriği tahmin etmek yerine lütfen tekrar deneyin.'
                    : 'Actiproc could not verify these records. Please retry rather than relying on estimated contents.';
              if(quotaReserved) {
                await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
                quotaReserved=false;
              }
              send({type:'delta',text:answer});assistantStatus='completed';
              await finalizeAssistantMessage({messageId:turn.assistantMessageId,scope,content:answer,
                status:'completed',model:'actiproc-read-scope-guard'});
              send({type:'done',finishReason:'completed'});return;
            }
            citations=readToolExecutions.flatMap((execution)=>execution.citations);
            readToolReferences=readToolExecutions.flatMap((execution)=>execution.references)
              .filter((reference,index,all)=>all.findIndex((candidate)=>candidate.type===reference.type&&candidate.id===reference.id)===index).slice(0,20);
            agentContext=buildAIReadToolContext(readToolExecutions.filter((execution)=>execution.name!=='search_knowledge'))||undefined;
            if(readToolReferences.length)send({type:'references',references:readToolReferences});
            grounding=citations.length?{kind:'knowledge',teamId:effectiveContext.teamId,processId:effectiveContext.processId}
              :readToolReferences.length?{kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId}:{kind:'none'};
          }

          // Exact lists and recent record previews don't require generation.
          // This path is reliable even when the model provider is overloaded.
          const canonicalReply=renderCanonicalWorkspaceAnswer(input.message,readToolExecutions);
          if(canonicalReply) {
            answer=canonicalReply;
            await finalizeAssistantMessage({
              messageId:turn.assistantMessageId,scope,content:answer,status:'completed',
              model:'actiproc-canonical-read',
              ...(readToolReferences.length?{references:readToolReferences}:{}),
              grounding:readToolReferences.length
                ?{kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId}
                :{kind:'none'},
            });
            send({type:'delta',text:answer});send({type:'done',finishReason:'completed'});
            assistantStatus='completed';
            await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat','actiproc-canonical-read',
              0,0,0,Date.now()-startedAt,true,undefined,{
                intent,plan:allowance.plan,canonicalRead:true,
                readTools:readToolExecutions.map(execution=>execution.name),
                toolCallCount:readToolExecutions.length,
              }).catch(()=>undefined);
            return;
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
              if (quotaReserved) {
                await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
                quotaReserved=false;
              }
              answer='Your Actiproc knowledge index does not contain an accessible match yet. Once indexing is enabled and current, I can answer this with verified sources.';
              send({ type:'delta',text:answer });assistantStatus='completed';
              await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model:'axiom-index-status' });
              send({ type:'done',finishReason:'completed' });return;
            }
            if (citations.length>0) grounding={ kind:'knowledge',teamId:effectiveContext.teamId,processId:effectiveContext.processId };
          } else if (!writeRequested&&!readToolExecutions.length&&!needsModelToolSelection&&intent==='structured') {
            if (!effectiveContext.teamId) {
              if (quotaReserved) {
                await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
                quotaReserved=false;
              }
              answer='Choose a team or open Actiproc AI from Knowledge Hub so I can answer this structured question from canonical Action data.';
              send({ type:'delta',text:answer });assistantStatus='completed';
              await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model:'axiom-scope-guard' });
              send({ type:'done',finishReason:'completed' });return;
            }
            structured=await retrieveStructuredActions({ teamId:effectiveContext.teamId,
              processId:effectiveContext.processId,limit:100,order:'updated_desc' });
            grounding={ kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId };
          }

          failureStage='context_preparation';
          const contextPlan=planChatContext({ intent,question:input.message,history:availableHistory,
            citations,structured,agentContext,configuredMaxOutputTokens:aiChatLimits.maxOutputTokens });

          const decision=selectChatModel({
            intent,question:input.message,profile:contextPlan.profile,writeRequested,
            organizationId:scope.organizationId,configuredMaxOutputTokens:contextPlan.maxOutputTokens,
          });
          failureStage='provider_initialization';
          provider=new GroqChatProvider({model:decision.model});model=provider.modelId;
          if(decision.routed) console.info(JSON.stringify({
            event:'ai_model_v2_routed',requestId:input.clientRequestId,
            route:decision.route,model:decision.model,
            rolloutBucket:decision.rolloutBucket,provider:'groq',
          }));
          // Backup is opt-in, separately metered, and never used to repeat
          // a mutation/proposal flow. It inherits exactly the same authorized
          // retrieval, citation validation, and context as the primary.
          const backupProvider=!writeRequested ? createOptionalOpenAIBackup() : null;
          let latestContextPlan=contextPlan;
          const requestedInputTokens=contextPlan.estimatedInputTokens
            +(needsModelToolSelection?estimateAIReadToolSelectionTokens(input.message,availableHistory,effectiveContext):0)
            +(writeRequested?1_200:0);
          const requestedOutputTokens=Math.min(contextPlan.maxOutputTokens,decision.maxOutputTokens)
            +(needsModelToolSelection?readToolSelectorMaxOutputTokens(model):0)+(writeRequested?500:0);
          const reserveBackup=async():Promise<GroqChatProvider|null>=>{
            if (!backupProvider||fallbackUsed||overallSignal.signal.aborted) return null;
            const backupAdmission=await reserveProviderTokens({
              // A distinct UUID is essential: provider token reservations use
              // request_key UNIQUE, even across different model/provider pairs.
              requestKey:randomUUID(),userId:scope.userId,organizationId:scope.organizationId,
              model:backupProvider.modelId,provider:'openai',tokenLimit:backupTokenBudget(),
              // If read-tool selection completed on primary, the backup
              // reserves only its final inference. The verified read context
              // may have grown since the initial admission estimate.
              estimatedInputTokens:latestContextPlan.estimatedInputTokens
                +(needsModelToolSelection&&!usedModelToolSelection
                  ?estimateAIReadToolSelectionTokens(input.message,availableHistory,effectiveContext):0),
              maxOutputTokens:Math.min(latestContextPlan.maxOutputTokens,decision.maxOutputTokens)
                +(needsModelToolSelection&&!usedModelToolSelection?readToolSelectorMaxOutputTokens(backupProvider.modelId):0),
            });
            if (!backupAdmission.allowed || !backupAdmission.reservationId) return null;
            fallbackUsed=true;
            tokenReservationId=backupAdmission.reservationId;
            fallbackStartingTokens=(inputTokens??0)+(outputTokens??0);
            return backupProvider;
          };

          const admissionArgs={
            requestKey:input.clientRequestId,userId:scope.userId,organizationId:scope.organizationId,model,
            estimatedInputTokens:requestedInputTokens,maxOutputTokens:requestedOutputTokens,
          };
          failureStage='provider_admission';
          let tokenAdmission=await reserveGroqTokens(admissionArgs);
          if(!tokenAdmission.allowed) {
            console.warn(JSON.stringify({
              event:'ai_provider_admission_denied',requestId:input.clientRequestId,
              model,reason:tokenAdmission.reason??'capacity',requestedTokens:tokenAdmission.requestedTokens,
              retryAfterSeconds:tokenAdmission.retryAfterSeconds??null,
              v2:process.env.AI_PROVIDER_ADMISSION_V2_ENABLED==='true',
            }));
            const wait=admissionRetryDelayMs({
              ...tokenAdmission,enabled:process.env.AI_CAPACITY_SHORT_WAIT_ENABLED==='true',
              timeRemainingMs:aiChatLimits.timeoutMs-(Date.now()-startedAt),
            });
            if(wait!==null && !overallSignal.signal.aborted){
              send({type:'tool_status',label:'AI kapasitesi kısa süreliğine dolu; yeniden deneniyor…'});
              await abortableDelay(wait,overallSignal.signal);
              tokenAdmission=await reserveGroqTokens(admissionArgs);
            }
          }
          tokenReservationId=tokenAdmission.reservationId;
          if (!tokenAdmission.allowed) {
            const backup=await reserveBackup();
            if (backup) {
              provider=backup;model=backup.modelId;
              send({type:'tool_status',label:'Yanıtın hazırlanması için uygun kapasite seçiliyor…'});
              console.info(JSON.stringify({event:'ai_fallback_selected',requestId:input.clientRequestId,reason:'primary_admission'}));
            } else {
              const errorEvent={ type:'error',code:'PROVIDER_TOKEN_BUDGET',
                message:AI_TEMPORARY_CAPACITY_MESSAGE,
                retryable:true,retryAfterSeconds:tokenAdmission.retryAfterSeconds } as const;
              if (quotaReserved) await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
              quotaReserved=false;
              send(errorEvent);await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:'',
                status:'failed',errorCode:errorEvent.code });assistantStatus='failed';return;
            }
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
              answer='İşlem taslağını hazırladım. Actiproc verilerinde hiçbir değişiklik yapılmadı; yalnızca aşağıdaki Onayla düğmesi işlemi gerçekleştirebilir.';
              await finalizeAssistantMessage({messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model,
                inputTokens,outputTokens,grounding:{kind:'none'}});
              send({type:'proposal',proposal});send({type:'delta',text:answer});send({type:'done',finishReason:'completed'});
              assistantStatus='completed';
              await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model,inputTokens??0,outputTokens??0,
                estimateGroqChatCostUsd(model,inputTokens??0,outputTokens??0),Date.now()-startedAt,true,undefined,
                {intent,plan:allowance.plan,writeProposalTool:selection.call.name,writeExecuted:false,costIsEstimate:true});
              return;
            }
          }
          if(needsModelToolSelection) {
            failureStage='read_tool_selection';
            billableAttempt=true;usedModelToolSelection=true;
            const selection=await selectAIReadTools({provider,question:input.message,history:availableHistory,
              context:effectiveContext,signal:overallSignal.signal,timeoutMs:aiChatLimits.timeoutMs});
            inputTokens=(inputTokens??0)+selection.inputTokens;outputTokens=(outputTokens??0)+selection.outputTokens;
            if(selection.calls.length) {
              readToolExecutions=await runReadToolCalls(selection.calls);
              const failedSelectionRead=readToolExecutions.find(execution=>{
                const payload=execution.data as {error?:string}|null;
                return Boolean(payload&&typeof payload.error==='string');
              });
              if(failedSelectionRead) {
                // Model selection errors are equally authoritative; never let
                // the final generator interpret error JSON as an empty list.
                const failure=failedSelectionRead.data as {error:string;message?:string};
                answer=failure.error==='not_found'
                  ?replyInTurkish?'Belirttiğiniz Process bulunamadı veya erişim izniniz yok.':'The Process was not found or is not accessible.'
                  :failure.error==='forbidden'
                    ?replyInTurkish?'Bu kayıtlara erişim izniniz yok.':'You do not have access to those records.'
                    :replyInTurkish?'Workspace verileri doğrulanamadı; lütfen tekrar deneyin.':'Workspace data could not be verified. Please retry.';
                if(quotaReserved){
                  await releaseAIQuotaReservation(input.clientRequestId,scope.userId,scope.organizationId);
                  quotaReserved=false;
                }
                send({type:'delta',text:answer});assistantStatus='completed';
                await finalizeAssistantMessage({messageId:turn.assistantMessageId,scope,content:answer,
                  status:'completed',model:'actiproc-selected-read-scope-guard'});
                send({type:'done',finishReason:'completed'});return;
              }
              // A semantic tool selection can recover an exact fact missed by
              // the fast path. Do not ask another LLM to hallucinate it.
              const selectedCanonical=renderCanonicalWorkspaceAnswer(input.message,readToolExecutions);
              if(selectedCanonical){
                answer=selectedCanonical;
                readToolReferences=readToolExecutions.flatMap(execution=>execution.references)
                  .filter((reference,index,all)=>all.findIndex(item=>
                    item.type===reference.type&&item.id===reference.id)===index).slice(0,20);
                definitelyNoNewProviderTokens=true; // selector billed, no generation
                await finalizeAssistantMessage({
                  messageId:turn.assistantMessageId,scope,content:answer,status:'completed',
                  model,inputTokens,outputTokens,
                  ...(readToolReferences.length?{references:readToolReferences}:{}),
                  grounding:{kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId},
                });
                if(readToolReferences.length)send({type:'references',references:readToolReferences});
                send({type:'delta',text:answer});
                send({type:'done',finishReason:'completed'});
                assistantStatus='completed';
                await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model??'groq',
                  inputTokens??0,outputTokens??0,
                  estimateGroqChatCostUsd(model??'groq',inputTokens??0,outputTokens??0),
                  Date.now()-startedAt,true,undefined,{
                    intent,plan:allowance.plan,modelToolSelection:true,canonicalRead:true,costIsEstimate:true,
                    readTools:readToolExecutions.map(execution=>execution.name),
                    toolCallCount:readToolExecutions.length,
                  }).catch(()=>undefined);
                return;
              }
              citations=readToolExecutions.flatMap((execution)=>execution.citations);
              readToolReferences=readToolExecutions.flatMap((execution)=>execution.references)
                .filter((reference,index,all)=>all.findIndex((candidate)=>candidate.type===reference.type&&candidate.id===reference.id)===index).slice(0,20);
              agentContext=buildAIReadToolContext(readToolExecutions.filter((execution)=>execution.name!=='search_knowledge'))||undefined;
              if(readToolReferences.length)send({type:'references',references:readToolReferences});
              grounding=citations.length?{kind:'knowledge',teamId:effectiveContext.teamId,processId:effectiveContext.processId}
                :readToolReferences.length?{kind:'structured',teamId:effectiveContext.teamId,processId:effectiveContext.processId}:{kind:'none'};
              finalContextPlan=planChatContext({intent,question:input.message,history:availableHistory,citations,
                agentContext,configuredMaxOutputTokens:aiChatLimits.maxOutputTokens});
              latestContextPlan=finalContextPlan;
            }
          }
          citations=finalContextPlan.citations;

          failureStage='model_generation';
          billableAttempt=true;
          const registry=createCitationRegistry(citations);
          let retriedOnce=false;
          let emittedResponseText=false;
          // A fallback/retry is permitted only before *any* text delta.
          // Once streaming starts, never stitch responses from different models.
          while (true) {
            try {
              const events=provider.stream({ messages:finalContextPlan.messages,
                temperature:0.25,maxOutputTokens:Math.min(finalContextPlan.maxOutputTokens,decision.maxOutputTokens),
                reasoning:{ effort:finalContextPlan.profile==='general'&&model.startsWith('qwen/')?'none':'low',format:'hidden' } },
                { requestId:randomUUID(),timeoutMs:aiChatLimits.timeoutMs,signal:overallSignal.signal });
              for await (const event of events) {
                if (event.type==='text_delta') {
                  emittedResponseText=true;
                  if (firstTokenMs===undefined) firstTokenMs=Date.now()-startedAt;
                  answer+=event.text;send({ type:'delta',text:event.text });
                } else if (event.type==='usage') {
                  sawStreamUsage=true;
                  inputTokens=(inputTokens??0)+(event.usage.inputTokens??0);
                  outputTokens=(outputTokens??0)+(event.usage.outputTokens??0);
                  send({ type:'usage',inputTokens,outputTokens });
                }
              }
              break;
            } catch (providerError) {
              if (overallSignal.signal.aborted) throw providerError;
              const failure=provider.normalizeError(providerError);
              // Single bounded, abortable retry. No queue held open for 30-60s
              // and no repetition of tool effects or user chat turns.
              const delay=shortRetryDelayMs(failure.retryAfterMs);
              if (!emittedResponseText && !retriedOnce && failure.code==='rate_limited'
                  && delay!==null && Date.now()-startedAt+delay<aiChatLimits.timeoutMs-4_000) {
                retriedOnce=true;
                send({type:'tool_status',label:AI_RETRYING_MESSAGE});
                console.info(JSON.stringify({event:'ai_safe_retry',requestId:input.clientRequestId,delayMs:delay}));
                await abortableDelay(delay,overallSignal.signal);
                continue;
              }

              if (mayFailOverBeforeResponse({
                code:failure.code,emittedText:emittedResponseText,
                aborted:overallSignal.signal.aborted,fallbackAlreadyUsed:fallbackUsed,writeRequested,
              })) {
                const primaryReservationId=tokenReservationId;
                const primaryUsage=(inputTokens??0)+(outputTokens??0);
                const backup=await reserveBackup();
                if (backup) {
                  // A 429 happens before inference. A successful read-tool
                  // selector may already have used primary tokens: count them.
                  // A 5xx has unknown usage: keep the reserved estimate.
                  await finalizeGroqTokens({
                    reservationId:primaryReservationId,userId:scope.userId,status:'failed',
                    actualTokens:failure.code==='rate_limited'?primaryUsage:undefined,
                  }).catch(()=>undefined);
                  provider=backup;model=backup.modelId;
                  console.info(JSON.stringify({event:'ai_fallback_selected',requestId:input.clientRequestId,
                    reason:failure.code}));
                  send({type:'tool_status',label:'Yanıt için alternatif kapasite kullanılıyor…'});
                  continue;
                }
              }
              if (failure.code==='rate_limited' && !emittedResponseText) {
                // Explicit pre-inference rejection. Preserve any known selector
                // usage but release the unused generation reservation.
                definitelyNoNewProviderTokens=true;
              }
              throw providerError;
            }
          }
          if(!answer.trim()) throw new Error('Provider returned an empty response');
          const allowed=new Set(registry.ids);
          answer=sanitizeAnswerCitations(answer,allowed);
          const referenced=citationIdsFromAnswer(answer);
          const verified=referenced.length ? registry.validate(referenced) : [];
          if (grounding.kind==='knowledge' && verified.length===0) {
            const error=new Error('Knowledge response omitted its required verified citation');
            error.name='CitationRequiredError';
            throw error;
          }
          failureStage='assistant_finalization';
          await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer,status:'completed',model,
            inputTokens,outputTokens,sources:verified,
            ...(readToolReferences.length?{references:readToolReferences}:{}),grounding });
          if (verified.length) send({ type:'sources',sources:verified });
          send({ type:'done',finishReason:'completed' });assistantStatus='completed';
          await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model,inputTokens ?? 0,outputTokens ?? 0,
            estimateGroqChatCostUsd(model,inputTokens??0,outputTokens??0),Date.now()-startedAt,true,undefined,
            { intent,plan:allowance.plan,costIsEstimate:true,citationCount:verified.length,
              retrievalSourceCount:citations.length,retrievalLatencyMs,firstTokenMs,
              contextProfile:finalContextPlan.profile,estimatedInputTokens:finalContextPlan.estimatedInputTokens,
              maxOutputTokens:finalContextPlan.maxOutputTokens,droppedHistoryMessages:finalContextPlan.droppedHistoryMessages,
              droppedCitations:finalContextPlan.droppedCitations,droppedStructuredActions:finalContextPlan.droppedStructuredActions,
              readTools:readToolExecutions.map((execution)=>execution.name),toolCallCount:readToolExecutions.length,
              modelToolSelection:usedModelToolSelection,fallbackUsed,
              ...(decision.routed?{modelRoute:decision.route,rolloutBucket:decision.rolloutBucket}:{}),
              providerAdmissionV2:process.env.AI_PROVIDER_ADMISSION_V2_ENABLED==='true' });
        } catch(error) {
          if (error instanceof AIWriteProposalError
              && (error.code==='ambiguous' || error.code==='not_found')) {
            // User-facing clarification rather than a failed message/toast.
            // The model may infer typos, but only the authorized, uniquely
            // resolved canonical record is allowed into an approval proposal.
            answer=error.message;
            assistantStatus='completed';
            await finalizeAssistantMessage({messageId:turn.assistantMessageId,scope,
              content:answer,status:'completed',model,inputTokens,outputTokens,
              grounding:{kind:'none'}});
            send({type:'delta',text:answer});
            send({type:'done',finishReason:'completed'});
            await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model??'groq',
              inputTokens??0,outputTokens??0,
              estimateGroqChatCostUsd(model??'groq',inputTokens??0,outputTokens??0),
              Date.now()-startedAt,true,undefined,
              {plan:allowance.plan,clarificationRequired:true,costIsEstimate:true});
            return;
          }
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
            failureStage,providerCategory:providerFailure?.code,modelId:model??null,
            durationMs:Date.now()-startedAt,retryable:normalized.retryable,
            providerStatus:providerFailure?.providerStatus,retryAfterMs:providerFailure?.retryAfterMs,
            upstreamRequestId:providerFailure?.upstreamRequestId,rateLimit:providerFailure?.rateLimit }));
          try { await finalizeAssistantMessage({ messageId:turn.assistantMessageId,scope,content:answer||normalized.message,
            status:assistantStatus,model,inputTokens,outputTokens,errorCode:normalized.code,
            sources:[],...(readToolReferences.length?{references:readToolReferences}:{}),grounding }); } catch { /* lease recovery remains */ }
          if (billableAttempt) await recordAIRequest(scope.userId,scope.organizationId,'axiom-chat',model ?? 'groq',
            inputTokens ?? 0,outputTokens ?? 0,
            estimateGroqChatCostUsd(model??'groq',inputTokens??0,outputTokens??0),
            Date.now()-startedAt,false,normalized.code,
            { failed:true,userQuotaRefunded,plan:allowance.plan,costIsEstimate:true,fallbackUsed });
          try { send({ type:'error',...normalized }); } catch { /* disconnected client */ }
        } finally {
          overallSignal.cleanup();
          // Completed usage is only trusted if the generation stream actually
          // reported usage. Unknown/partial attempts keep a conservative hold.
          // Known pre-inference 429s explicitly settle to 0 (or selector usage)
          // and free the unused rolling reservation immediately.
          const usageKnown=sawStreamUsage||definitelyNoNewProviderTokens;
          const currentProviderTokens=Math.max(0,(inputTokens??0)+(outputTokens??0)-fallbackStartingTokens);
          await finalizeGroqTokens({ reservationId:tokenReservationId,userId:scope.userId,status:assistantStatus,
            actualTokens:usageKnown?currentProviderTokens:undefined }).catch(()=>undefined);
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
