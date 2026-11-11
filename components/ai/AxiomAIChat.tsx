'use client';

import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Loader2, Menu, MessageSquarePlus, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import type { AIChatContext,AIChatMessage,AIConversationSummary } from '@/lib/ai/chat/types';
import { parseChatSSEBuffer } from '@/lib/ai/chat/sse';
import { safeAIErrorMessage } from '@/lib/ai/chat/reliability-policy';
import { aiAvailabilityMessage } from '@/lib/ai/chat/availability-message';
import { AIComposer, AIHistoryPanel, AIMessageRow, AIWelcome } from './AIChatPresentation';
import { AIAllowanceIndicator } from './AIAllowanceIndicator';
import { useTaskContext } from '@/components/TaskContext';

function contextFromParams(params:Pick<URLSearchParams, 'get'>):AIChatContext {
  const teamId=params.get('teamId') ?? undefined,processId=params.get('processId') ?? undefined;
  return { origin:params.get('origin')==='knowledge_hub'?'knowledge_hub':'global',
    ...(teamId ? { teamId } : {}),...(processId ? { processId } : {}) };
}

export type AxiomAIChatViewProps = {
  enabled: boolean;
  context?: AIChatContext;
  request?: typeof fetch;
  openTaskEditor: (taskId: string, checklistItemId?: string | null) => void;
  refreshData: () => Promise<void>;
};

/** Platform-neutral AI presentation shared by Next.js and Capacitor. */
export function AxiomAIChatView({
  enabled,
  context = { origin: 'global' },
  request = fetch,
  openTaskEditor,
  refreshData,
}: AxiomAIChatViewProps) {
  const [conversations,setConversations]=useState<AIConversationSummary[]>([]);
  const [historyLoading,setHistoryLoading]=useState(true);
  const [historyError,setHistoryError]=useState<string|null>(null);
  const [conversationId,setConversationId]=useState<string|null>(null);
  const [messages,setMessages]=useState<AIChatMessage[]>([]);
  const [input,setInput]=useState('');const [loading,setLoading]=useState(false);const [historyOpen,setHistoryOpen]=useState(false);
  const [proposalBusy,setProposalBusy]=useState<string|null>(null);
  const [usageRefreshKey,setUsageRefreshKey]=useState(0);
  const abortRef=useRef<AbortController|null>(null),scrollRef=useRef<HTMLDivElement|null>(null);

  const refreshConversations=useCallback(async()=>{
    if (!enabled) return;
    setHistoryLoading(true);
    try {
      const response=await request('/api/ai/conversations',{ cache:'no-store' });
      const payload=await response.json().catch(()=>null);
      if(!response.ok) {
        const code=typeof payload?.error?.code==='string'?payload.error.code:'';
        throw new Error(aiAvailabilityMessage(code,response.status));
      }
      if(!Array.isArray(payload?.conversations)) throw new Error('Conversation history could not be loaded. Please retry.');
      setConversations(payload.conversations);
      setHistoryError(null);
    } catch(error) {
      // Retain last successfully loaded history. A 503 is never an empty list.
      setHistoryError(error instanceof Error?error.message:'Conversation history could not be loaded. Please retry.');
    } finally {
      setHistoryLoading(false);
    }
  },[enabled,request]);
  useEffect(()=>{ void refreshConversations(); },[refreshConversations]);
  useEffect(()=>{ const container=scrollRef.current; if(container) container.scrollTo({ top:container.scrollHeight, behavior:loading?'auto':'smooth' }); },[messages,loading]);

  const selectConversation=async(id:string)=>{
    if (loading) return;
    try {
      const response=await request(`/api/ai/conversations/${id}`,{ cache:'no-store' });
      if (!response.ok) { toast.error('Conversation could not be loaded');return; }
      const payload=await response.json();
      setConversationId(id);setMessages(payload.messages ?? []);setHistoryOpen(false);
    } catch { toast.error('Conversation could not be loaded'); }
  };
  const newConversation=()=>{ if (!loading){ setConversationId(null);setMessages([]);setHistoryOpen(false); } };
  const renameConversation=async(item:AIConversationSummary,title:string):Promise<boolean>=>{
    const cleaned=title.trim();if (!cleaned||cleaned===item.title) return true;
    try {
      const response=await request('/api/ai/conversations/'+encodeURIComponent(item.id),{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:cleaned})
      });
      if(!response.ok) throw new Error('Title could not be saved');
      await refreshConversations();
      return true;
    } catch { toast.error('Title could not be saved');return false; }
  };
  const removeConversation=async(id:string):Promise<boolean>=>{
    try {
      const response=await request('/api/ai/conversations/'+encodeURIComponent(id),{method:'DELETE'});
      if(!response.ok) throw new Error('Conversation could not be deleted');
      if(conversationId===id) newConversation();
      await refreshConversations();
      return true;
    } catch { toast.error('Conversation could not be deleted');return false; }
  };

  const handleProposal=async(messageId:string,proposalId:string,action:'approve'|'reject')=>{
    if(!conversationId||proposalBusy) return;
    setProposalBusy(proposalId);
    try {
      const response=await request(`/api/ai/write-proposals/${proposalId}`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({conversationId,action})});
      const payload=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(payload?.error?.message??'Proposal could not be processed');
      if(action==='approve'&&payload.proposal.status==='completed') await refreshData();
      setMessages((current)=>current.map((message)=>message.id===messageId?{...message,proposal:payload.proposal}:message));
      if(action==='approve'&&payload.proposal.status==='completed') toast.success('Actiproc işlemi başarıyla tamamlandı');
      else if(action==='reject') toast.success('Taslak reddedildi; hiçbir değişiklik yapılmadı');
    } catch(error) { toast.error(error instanceof Error?error.message:'Proposal could not be processed'); }
    finally { setProposalBusy(null); }
  };

  const send=async(raw:string,retryAssistantMessageId?:string)=>{
    const message=raw.trim();if (!message||loading||!enabled) return;
    if (!retryAssistantMessageId) setInput('');
    setLoading(true);const controller=new AbortController();abortRef.current=controller;
    let activeConversation=conversationId;
    let optimisticAssistant=retryAssistantMessageId;
    try {
      if (!activeConversation) {
        const created=await request('/api/ai/conversations',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ context }) });
        if (!created.ok) {
          const errorPayload=await created.json().catch(()=>null);
          const code=String(errorPayload?.error?.code??'');
          throw Object.assign(new Error(aiAvailabilityMessage(code,created.status)),{aiAccessCode:code});
        }
        const createdPayload=await created.json();
        activeConversation=createdPayload.conversation.id;setConversationId(activeConversation);
      }
      const requestId=crypto.randomUUID(),optimisticUser=`user-${requestId}`;
      optimisticAssistant=retryAssistantMessageId??`assistant-${requestId}`;
      if (retryAssistantMessageId) {
        // Reuse the failed turn: backend claims its existing assistant record,
        // so both the live view and reloaded history have no duplicate question.
        setMessages((current)=>current.map((item)=>item.id===retryAssistantMessageId
          ? {...item,status:'streaming',content:'',errorCode:undefined,activity:'Preparing your answer…'}
          : item));
      } else {
        setMessages((current)=>[...current,
          { id:optimisticUser,role:'user',content:message,status:'completed',model:null,createdAt:new Date().toISOString(),sources:[] },
          { id:optimisticAssistant!,role:'assistant',content:'',status:'streaming',model:null,createdAt:new Date().toISOString(),sources:[] },
        ]);
      }
      const response=await request('/api/ai/chat',{ method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ conversationId:activeConversation,clientRequestId:requestId,message,context,
          ...(retryAssistantMessageId?{retryAssistantMessageId}:{}) }) });
      if (!response.ok||!response.body) {
        const payload=await response.json().catch(()=>null);
        const code=String(payload?.error?.code??'');
        throw Object.assign(new Error(aiAvailabilityMessage(code,response.status)),{aiAccessCode:code});
      }
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',realAssistantId=optimisticAssistant;
      while(true) {
        const { value,done }=await reader.read();if(done) break;buffer+=decoder.decode(value,{ stream:true });
        const parsedFrames=parseChatSSEBuffer(buffer);buffer=parsedFrames.remainder;
        for(const event of parsedFrames.events) {
          if(event.type==='meta') { realAssistantId=event.assistantMessageId;setMessages((current)=>current.map((item)=>item.id===optimisticUser?{...item,id:event.userMessageId}:item.id===optimisticAssistant?{...item,id:event.assistantMessageId}:item)); }
          else if(event.type==='delta') setMessages((current)=>current.map((item)=>item.id===realAssistantId||item.id===optimisticAssistant?{...item,content:item.content+event.text,activity:undefined}:item));
          else if(event.type==='sources') setMessages((current)=>current.map((item)=>item.id===realAssistantId?{...item,sources:event.sources}:item));
          else if(event.type==='references') setMessages((current)=>current.map((item)=>item.id===realAssistantId||item.id===optimisticAssistant?{...item,references:event.references}:item));
          else if(event.type==='tool_status') setMessages((current)=>current.map((item)=>item.id===realAssistantId||item.id===optimisticAssistant?{...item,activity:event.label}:item));
          else if(event.type==='proposal') setMessages((current)=>current.map((item)=>item.id===realAssistantId||item.id===optimisticAssistant?{...item,proposal:event.proposal}:item));
          else if(event.type==='done') setMessages((current)=>current.map((item)=>item.id===realAssistantId?{...item,status:event.finishReason==='cancelled'?'cancelled':'completed',activity:undefined}:item));
          else if(event.type==='error') {
            const publicMessage=safeAIErrorMessage(event.code,event.message);
            setMessages((current)=>current.map((item)=>item.id===realAssistantId||item.id===optimisticAssistant?{
              ...item,content:item.content||publicMessage,errorCode:event.code,
              status:event.code==='CANCELLED'?'cancelled':'failed',activity:undefined,
            }:item));
            if (event.code!=='CANCELLED') toast.error(publicMessage);
          }
        }
      }
      await refreshConversations();
    } catch(error) {
      const cancelled=(error as Error)?.name==='AbortError'||controller.signal.aborted;
      const accessCode=(error as {aiAccessCode?:string}|null)?.aiAccessCode;
      const publicMessage=accessCode
        ? aiAvailabilityMessage(accessCode)
        :safeAIErrorMessage('AI_UNAVAILABLE',error instanceof Error?error.message:undefined);
      if (!cancelled) toast.error(publicMessage);
      setMessages((current)=>current.map((item)=>optimisticAssistant && item.id===optimisticAssistant && item.status==='streaming'
        ? {...item,status:cancelled?'cancelled':'failed',content:item.content||(cancelled?'Generation stopped':publicMessage),
          errorCode:cancelled?'CANCELLED':'AI_UNAVAILABLE',activity:undefined}
        : item));
    } finally {
      if(abortRef.current===controller) abortRef.current=null;
      setLoading(false);
      setUsageRefreshKey((value)=>value+1);
    }
  };

  const activeConversation=conversations.find((item)=>item.id===conversationId);
  const activeContext=activeConversation?.context ?? context;
  const contextLabel=activeContext.processId?'Process context':activeContext.teamId?'Team workspace':'Authorized workspace';
  const history=(
    <AIHistoryPanel conversations={conversations} activeId={conversationId} disabled={loading}
      historyLoading={historyLoading} historyError={historyError}
      onRetryHistory={()=>void refreshConversations()}
      onSelect={(id)=>void selectConversation(id)} onNew={newConversation}
      onRename={renameConversation} onDelete={removeConversation}/>
  );

  if(!enabled) return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-4">
      <div className="w-full rounded-[22px] border border-border/75 bg-card p-8 text-center shadow-sm">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Bot className="h-7 w-7" aria-hidden="true"/>
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Actiproc AI is not enabled</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          An administrator must verify the chat migration, atomic quota and provider configuration first.
        </p>
      </div>
    </div>
  );

  return (
    <div className="axiom-ai-chat actiproc-ai-shell mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[420px] w-full max-w-[1490px] overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-[0_18px_70px_-50px_hsl(var(--foreground)/0.35)] max-sm:rounded-[16px]">
      <aside className="hidden w-[298px] shrink-0 border-r border-border/60 bg-muted/[0.14] lg:block xl:w-[318px]" aria-label="AI conversation sidebar">
        {history}
      </aside>
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex min-h-[68px] shrink-0 items-center gap-2.5 border-b border-border/60 bg-card/90 px-3.5 py-2.5 backdrop-blur-xl sm:gap-3 sm:px-5">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Open conversation history"
                className="h-9 w-9 shrink-0 rounded-xl text-foreground hover:bg-muted hover:text-foreground lg:hidden">
                <Menu className="h-4.5 w-4.5" aria-hidden="true"/>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex h-[100dvh] w-[min(90vw,348px)] flex-col border-r border-border/70 bg-card p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Conversation history</SheetTitle>
                <SheetDescription>Search, create, and open existing Actiproc AI conversations.</SheetDescription>
              </SheetHeader>
              {history}
            </SheetContent>
          </Sheet>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-primary/20 bg-gradient-to-br from-primary/[0.17] to-emerald-500/[0.045] text-primary">
            <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden="true"/>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[13.5px] font-semibold tracking-[-0.02em] text-foreground sm:text-[15px]">Actiproc AI</h1>
            <p className="truncate text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
              {activeConversation?.title ?? 'Your workspace intelligence'}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/75 bg-muted/45 px-2.5 py-1.5 text-[10px] font-semibold text-foreground/80 xl:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true"/> <span title="Results depend on Teams and Processes you are authorized to access; read tools must be enabled.">{contextLabel}</span>
          </span>
          <AIAllowanceIndicator request={request} refreshKey={usageRefreshKey}/>
          <Button type="button" variant="ghost" size="icon" aria-label="New conversation"
            title="New conversation" disabled={loading} onClick={newConversation}
            className="h-9 w-9 shrink-0 rounded-xl text-foreground hover:bg-muted hover:text-foreground lg:hidden">
            <MessageSquarePlus className="h-4.5 w-4.5" aria-hidden="true"/>
          </Button>
        </header>
        {historyError && (
          <div role="status" className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/25 bg-amber-500/[0.075] px-4 py-2.5 text-xs text-foreground">
            <span>{historyError}</span>
            <Button type="button" variant="outline" size="sm" onClick={()=>void refreshConversations()}
              disabled={historyLoading} className="shrink-0">Retry</Button>
          </div>
        )}
        <div ref={scrollRef} className="actiproc-ai-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gradient-to-b from-primary/[0.018] via-transparent to-transparent px-3 py-2 sm:px-6 sm:py-5">
          {messages.length===0 ? (
            <AIWelcome onPrompt={(prompt)=>void send(prompt)} loading={loading}/>
          ) : (
            <div className="mx-auto max-w-[860px] space-y-3 pb-10 pt-5 sm:space-y-5 sm:pt-7">
              {messages.map((message,index)=>(
                <AIMessageRow key={message.id} message={message}
                  lastUser={messages.slice(0,index).reverse().find((candidate)=>candidate.role==='user')}
                  proposalBusy={proposalBusy} onProposal={handleProposal}
                  onOpenAction={openTaskEditor}
                  onRetry={(text,assistantMessageId)=>void send(text,assistantMessageId)}/>
              ))}
            </div>
          )}
        </div>
        <AIComposer input={input} setInput={setInput} loading={loading}
          onSend={(text)=>void send(text)}
          onStop={()=>abortRef.current?.abort()}
          contextLabel={contextLabel}/>
      </section>
    </div>
  );
}

export function AxiomAIChat({ enabled }:{ enabled:boolean }) {
  const { openTaskEditor,refreshData } = useTaskContext();
  const params=useSearchParams();
  const context=useMemo(()=>contextFromParams(params),[params]);
  return (
    <AxiomAIChatView
      enabled={enabled}
      context={context}
      openTaskEditor={openTaskEditor}
      refreshData={refreshData}
    />
  );
}
