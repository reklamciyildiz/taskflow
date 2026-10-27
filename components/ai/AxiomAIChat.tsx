'use client';

import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot,Check,Copy,Loader2,Menu,MessageSquarePlus,Pencil,Send,Square,Trash2,RotateCcw,X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet,SheetContent,SheetHeader,SheetTitle,SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AIChatContext,AIChatMessage,AIConversationSummary } from '@/lib/ai/chat/types';
import { parseChatSSEBuffer } from '@/lib/ai/chat/sse';
import { SafeAIMessage } from './SafeAIMessage';
import { useTaskContext } from '@/components/TaskContext';

const suggestions=['What did I learn recently?','List the latest Actions in this Process','How does Planner scheduling work?'];

function contextFromParams(params:Pick<URLSearchParams, 'get'>):AIChatContext {
  const teamId=params.get('teamId') ?? undefined,processId=params.get('processId') ?? undefined;
  return { origin:params.get('origin')==='knowledge_hub'?'knowledge_hub':'global',
    ...(teamId ? { teamId } : {}),...(processId ? { processId } : {}) };
}

function HistoryPanel(props:{ conversations:AIConversationSummary[];activeId:string|null;onSelect:(id:string)=>void;
  onNew:()=>void;onRename:(item:AIConversationSummary)=>void;onDelete:(id:string)=>void }) {
  return <div className="flex h-full min-h-0 flex-col">
    <div className="border-b p-3"><Button className="w-full justify-start gap-2" variant="outline" onClick={props.onNew}><MessageSquarePlus className="h-4 w-4"/>New chat</Button></div>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">{props.conversations.map((item)=><div key={item.id} className={cn('group flex items-center rounded-lg',props.activeId===item.id&&'bg-secondary')}>
      <button className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm" onClick={()=>props.onSelect(item.id)}>{item.title}</button>
      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 hover:opacity-100" aria-label="Rename conversation" onClick={()=>props.onRename(item)}><Pencil className="h-3.5 w-3.5"/></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 hover:text-destructive hover:opacity-100" aria-label="Delete conversation" onClick={()=>props.onDelete(item.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
    </div>)}</div>
  </div>;
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
  const [conversationId,setConversationId]=useState<string|null>(null);
  const [messages,setMessages]=useState<AIChatMessage[]>([]);
  const [input,setInput]=useState('');const [loading,setLoading]=useState(false);const [historyOpen,setHistoryOpen]=useState(false);
  const [proposalBusy,setProposalBusy]=useState<string|null>(null);
  const abortRef=useRef<AbortController|null>(null),bottomRef=useRef<HTMLDivElement|null>(null);

  const refreshConversations=useCallback(async()=>{
    if (!enabled) return;
    const response=await request('/api/ai/conversations',{ cache:'no-store' });
    if (response.ok) setConversations((await response.json()).conversations ?? []);
  },[enabled,request]);
  useEffect(()=>{ void refreshConversations(); },[refreshConversations]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({ behavior:'smooth',block:'end' }); },[messages,loading]);

  const selectConversation=async(id:string)=>{
    if (loading) return; setConversationId(id);setHistoryOpen(false);
    const response=await request(`/api/ai/conversations/${id}`,{ cache:'no-store' });
    if (!response.ok) { toast.error('Conversation could not be loaded');return; }
    setMessages((await response.json()).messages ?? []);
  };
  const newConversation=()=>{ if (!loading){ setConversationId(null);setMessages([]);setHistoryOpen(false); } };
  const renameConversation=async(item:AIConversationSummary)=>{
    const title=window.prompt('Conversation title',item.title)?.trim();if (!title||title===item.title) return;
    const response=await request(`/api/ai/conversations/${item.id}`,{ method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ title }) });
    if (!response.ok) toast.error('Title could not be saved');else void refreshConversations();
  };
  const removeConversation=async(id:string)=>{
    if (!window.confirm('Delete this conversation?')) return;
    const response=await request(`/api/ai/conversations/${id}`,{ method:'DELETE' });
    if (!response.ok) { toast.error('Conversation could not be deleted');return; }
    if (conversationId===id) newConversation();void refreshConversations();
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

  const send=async(raw:string)=>{
    const message=raw.trim();if (!message||loading||!enabled) return;
    setInput('');setLoading(true);const controller=new AbortController();abortRef.current=controller;
    let activeConversation=conversationId;
    try {
      if (!activeConversation) {
        const created=await request('/api/ai/conversations',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ context }) });
        if (!created.ok) throw new Error((await created.json()).error?.message ?? 'Conversation could not be created');
        activeConversation=(await created.json()).conversation.id;setConversationId(activeConversation);
      }
      const requestId=crypto.randomUUID(),optimisticUser=`user-${requestId}`,optimisticAssistant=`assistant-${requestId}`;
      setMessages((current)=>[...current,
        { id:optimisticUser,role:'user',content:message,status:'completed',model:null,createdAt:new Date().toISOString(),sources:[] },
        { id:optimisticAssistant,role:'assistant',content:'',status:'streaming',model:null,createdAt:new Date().toISOString(),sources:[] },
      ]);
      const response=await request('/api/ai/chat',{ method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ conversationId:activeConversation,clientRequestId:requestId,message,context }) });
      if (!response.ok||!response.body) {
        const payload=await response.json().catch(()=>null);throw new Error(payload?.error?.message ?? 'Actiproc AI is unavailable');
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
          else if(event.type==='error') { setMessages((current)=>current.map((item)=>item.id===realAssistantId||item.id===optimisticAssistant?{
            ...item,content:item.content||event.message,status:event.code==='CANCELLED'?'cancelled':'failed',activity:undefined,
          }:item));toast.error(event.message); }
        }
      }
      await refreshConversations();
    } catch(error) {
      if ((error as Error).name!=='AbortError') toast.error(error instanceof Error?error.message:'Actiproc AI is unavailable');
      setMessages((current)=>current.map((item)=>item.status==='streaming'?{...item,status:controller.signal.aborted?'cancelled':'failed'}:item));
    } finally { if(abortRef.current===controller) abortRef.current=null;setLoading(false); }
  };

  const lastUser=[...messages].reverse().find((message)=>message.role==='user');
  const history=<HistoryPanel conversations={conversations} activeId={conversationId} onSelect={(id)=>void selectConversation(id)} onNew={newConversation} onRename={(item)=>void renameConversation(item)} onDelete={(id)=>void removeConversation(id)}/>;
  if(!enabled) return <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center"><div className="rounded-2xl border bg-card p-8 text-center"><Bot className="mx-auto mb-4 h-10 w-10 text-primary"/><h1 className="text-xl font-semibold">Actiproc AI is not enabled</h1><p className="mt-2 text-sm text-muted-foreground">An administrator must verify the chat migration, atomic quota and provider configuration first.</p></div></div>;

  return <div className="axiom-ai-chat mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[32rem] max-w-7xl overflow-hidden rounded-2xl border bg-card shadow-sm">
    <aside className="hidden w-72 shrink-0 border-r bg-muted/20 lg:block">{history}</aside>
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-5">
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open chat history"><Menu className="h-5 w-5"/></Button></SheetTrigger><SheetContent side="left" className="w-[88vw] max-w-sm p-0"><SheetHeader className="border-b p-4"><SheetTitle>Chat history</SheetTitle></SheetHeader>{history}</SheetContent></Sheet>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5"/></div><div><h1 className="font-semibold">Actiproc AI</h1><p className="text-xs text-muted-foreground">Verified workspace knowledge, when available</p></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-6">
        {messages.length===0?<div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center"><div className="mb-5 rounded-2xl bg-gradient-to-br from-violet-500/15 to-cyan-500/15 p-4"><Bot className="h-9 w-9 text-primary"/></div><h2 className="text-2xl font-semibold">How can I help?</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Ask about accessible Actiproc knowledge, your current work, or how the product works.</p><div className="mt-7 grid w-full gap-2 sm:grid-cols-3">{suggestions.map((suggestion)=><button key={suggestion} className="rounded-xl border bg-background p-3 text-left text-sm transition-colors hover:bg-muted" onClick={()=>void send(suggestion)}>{suggestion}</button>)}</div></div>
        :<div className="mx-auto max-w-3xl space-y-6">{messages.map((message)=><article key={message.id} className={cn('group flex gap-3',message.role==='user'&&'justify-end')}>
          {message.role==='assistant'&&<div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-4 w-4"/></div>}
          <div className={cn('min-w-0 max-w-[88%] rounded-2xl px-4 py-3',message.role==='user'?'bg-primary text-primary-foreground':'border bg-background')}>
            {message.content?<SafeAIMessage content={message.content} sources={message.sources}/>:message.status==='streaming'?<div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/><span>{message.activity??'Actiproc AI düşünüyor…'}</span></div>:null}
            {message.sources.length>0&&<div className="mt-4 grid gap-2 border-t pt-3">{message.sources.map((source,index)=><button key={source.citationId} disabled={!source.navigation.actionId} className="rounded-lg border bg-muted/30 p-2.5 text-left text-xs enabled:hover:bg-muted disabled:cursor-default" onClick={()=>source.navigation.actionId&&openTaskEditor(source.navigation.actionId)}><span className="font-medium">[{index+1}] {source.title}</span><span className="mt-1 line-clamp-2 block text-muted-foreground">{source.snippet}</span></button>)}</div>}
            {message.references&&message.references.length>0&&<div className="mt-4 grid gap-2 border-t pt-3">{message.references.slice(0,12).map((reference)=><button key={`${reference.type}:${reference.id}`} disabled={!reference.actionId} className="rounded-lg border bg-muted/30 p-2.5 text-left text-xs enabled:hover:bg-muted disabled:cursor-default" onClick={()=>reference.actionId&&openTaskEditor(reference.actionId,reference.checklistItemId)}><span className="font-medium">{reference.title}</span><span className="mt-1 block capitalize text-muted-foreground">{reference.type}</span></button>)}</div>}
            {message.proposal&&<div className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.04] p-3 text-foreground">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{message.proposal.title}</p><p className="mt-1 text-xs text-muted-foreground">{message.proposal.summary}</p></div><span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide">{message.proposal.status}</span></div>
              <p className="mt-3 text-xs font-medium">Hedef: {message.proposal.targetLabel}</p>
              {message.proposal.fields.length>0&&<dl className="mt-2 grid gap-2 text-xs">{message.proposal.fields.map((field,index)=><div key={`${field.label}-${index}`} className="grid grid-cols-[5rem_1fr] gap-2"><dt className="text-muted-foreground">{field.label}</dt><dd className="min-w-0 break-words">{field.oldValue!==undefined||field.newValue!==undefined?<div className="grid gap-1"><span className="rounded bg-muted px-2 py-1 text-muted-foreground line-through">{field.oldValue||'Boş'}</span><span className="rounded bg-primary/10 px-2 py-1 font-medium">{field.newValue||'Boş'}</span></div>:field.value}</dd></div>)}</dl>}
              {message.proposal.status==='pending'&&<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" className="gap-1.5" disabled={proposalBusy===message.proposal.id} onClick={()=>void handleProposal(message.id,message.proposal!.id,'approve')}>{proposalBusy===message.proposal.id?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Check className="h-3.5 w-3.5"/>}Onayla ve uygula</Button><Button size="sm" variant="outline" className="gap-1.5" disabled={proposalBusy===message.proposal.id} onClick={()=>void handleProposal(message.id,message.proposal!.id,'reject')}><X className="h-3.5 w-3.5"/>Reddet</Button></div>}
              {message.proposal.status==='completed'&&message.proposal.result&&<Button size="sm" variant="outline" className="mt-3" disabled={!message.proposal.result.actionId} onClick={()=>message.proposal?.result?.actionId&&openTaskEditor(message.proposal.result.actionId,message.proposal.result.checklistItemId)}>Kaydı aç</Button>}
              {message.proposal.status==='failed'&&<p className="mt-3 text-xs text-destructive">{message.proposal.error??'İşlem tamamlanamadı; başarı kaydı oluşturulmadı.'}</p>}
              {message.proposal.status==='rejected'&&<p className="mt-3 text-xs text-muted-foreground">Reddedildi; Actiproc verilerinde değişiklik yapılmadı.</p>}
              {message.proposal.status==='expired'&&<p className="mt-3 text-xs text-muted-foreground">Bu taslağın süresi doldu. Yeni bir taslak isteyin.</p>}
            </div>}
            {message.role==='assistant'&&message.content&&<div className="mt-2 flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy response" onClick={()=>void navigator.clipboard.writeText(message.content).then(()=>toast.success('Copied'))}><Copy className="h-3.5 w-3.5"/></Button>{message.status==='failed'&&lastUser&&<Button variant="ghost" size="sm" className="h-7 gap-1" onClick={()=>void send(lastUser.content)}><RotateCcw className="h-3.5 w-3.5"/>Retry</Button>}</div>}
          </div></article>)}<div ref={bottomRef}/></div>}
      </div>
      <footer className="shrink-0 border-t bg-background/90 p-3 backdrop-blur sm:p-4"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm"><Textarea value={input} onChange={(event)=>setInput(event.target.value)} placeholder="Ask Actiproc AI…" aria-label="Message Actiproc AI" rows={1} className="max-h-36 min-h-[42px] resize-none border-0 bg-transparent focus-visible:ring-0" onKeyDown={(event)=>{ if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send(input);} }}/>{loading?<Button size="icon" variant="destructive" aria-label="Stop generating" onClick={()=>abortRef.current?.abort()}><Square className="h-4 w-4 fill-current"/></Button>:<Button size="icon" aria-label="Send message" disabled={!input.trim()} onClick={()=>void send(input)}><Send className="h-4 w-4"/></Button>}</div><p className="mt-2 text-center text-[11px] text-muted-foreground">Actiproc AI can make mistakes. Source cards are shown only after current access validation.</p></footer>
    </section>
  </div>;
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
