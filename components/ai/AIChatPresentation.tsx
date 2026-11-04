'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUp, BookOpen, Check, CheckCheck, Clock3, Copy,
  FileText, FolderKanban, Lightbulb, ListTodo, Loader2, MessageSquare,
  MessageSquarePlus, MoreHorizontal, Pencil, RotateCcw, Search, ShieldCheck,
  Sparkles, Square, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AIChatMessage, AIConversationSummary } from '@/lib/ai/chat/types';
import { SafeAIMessage } from './SafeAIMessage';
import { safeAIErrorMessage } from '@/lib/ai/chat/reliability-policy';

type HistoryProps = {
  conversations: AIConversationSummary[];
  activeId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (item: AIConversationSummary, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

function historyPeriod(value: string): 'Today' | 'Yesterday' | 'Earlier' {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp.getTime() >= startOfToday) return 'Today';
  if (timestamp.getTime() >= startOfToday - 86_400_000) return 'Yesterday';
  return 'Earlier';
}

export function AIHistoryPanel({
  conversations, activeId, disabled, onSelect, onNew, onRename, onDelete,
}: HistoryProps) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AIConversationSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);

  const grouped = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const visible = conversations
      .filter((item) => item.title.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => Date.parse(b.lastMessageAt || b.updatedAt) - Date.parse(a.lastMessageAt || a.updatedAt));
    return (['Today', 'Yesterday', 'Earlier'] as const)
      .map((period) => ({
        period,
        items: visible.filter((item) => historyPeriod(item.lastMessageAt || item.updatedAt) === period),
      }))
      .filter((group) => group.items.length > 0);
  }, [conversations, query]);

  const saveRename = async (item: AIConversationSummary) => {
    const title = editingTitle.trim();
    if (!title || title === item.title) { setEditingId(null); return; }
    setSaving(true);
    try {
      if (await onRename(item, title)) setEditingId(null);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border/50 px-3.5 pb-4 pt-4 sm:px-4">
        <div className="flex items-center gap-2.5 px-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <MessageSquare className="h-4 w-4" aria-hidden="true"/>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold tracking-tight text-foreground">Conversations</p>
            <p className="text-[11px] text-muted-foreground">Your AI workspace history</p>
          </div>
          <span className="rounded-md border border-border/65 bg-background/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{conversations.length}</span>
        </div>
        <Button
          type="button" onClick={onNew} disabled={disabled}
          className="h-10 w-full justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_6px_20px_-12px_hsl(var(--primary))] hover:bg-primary/90"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true"/> New conversation
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
          <Input
            value={query} onChange={(event) => setQuery(event.target.value)}
            aria-label="Search conversations" placeholder="Search conversations"
            className="h-9 rounded-lg border-border/60 bg-background/50 pl-9 pr-8 text-xs placeholder:text-muted-foreground/75 focus-visible:ring-primary/30"
          />
          {query && (
            <button type="button" aria-label="Clear conversation search" onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" aria-hidden="true"/>
            </button>
          )}
        </div>
      </div>
      <nav aria-label="Conversation history" className="actiproc-ai-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-2.5 py-4 sm:px-3">
        {grouped.length ? grouped.map(({ period, items }) => (
          <section key={period} aria-label={period + ' conversations'}>
            <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">{period}</h3>
            <div className="space-y-1">
              {items.map((item) => {
                const active = item.id === activeId;
                return (
                  <div key={item.id} className={cn(
                    'group relative flex min-w-0 items-center rounded-xl border transition-[background-color,border-color,box-shadow] duration-150',
                    active
                      ? 'border-primary/25 bg-primary/[0.09] shadow-[inset_2px_0_0_hsl(var(--primary))]'
                      : 'border-transparent hover:border-border/65 hover:bg-muted/55'
                  )}>
                    {editingId === item.id ? (
                      <form className="flex min-w-0 flex-1 items-center gap-1 p-1.5"
                        onSubmit={(event) => { event.preventDefault(); void saveRename(item); }}>
                        <Input ref={editRef} value={editingTitle} maxLength={120}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onKeyDown={(event) => { if (event.key === 'Escape') setEditingId(null); }}
                          aria-label="Edit conversation title"
                          className="h-8 min-w-0 flex-1 border-primary/30 bg-background text-xs"/>
                        <button type="submit" disabled={saving} aria-label="Save conversation title"
                          className="rounded-lg p-1.5 text-primary hover:bg-primary/10 disabled:opacity-50">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}
                        </button>
                        <button type="button" aria-label="Cancel rename" onClick={() => setEditingId(null)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <X className="h-4 w-4"/>
                        </button>
                      </form>
                    ) : (
                      <>
                        <button type="button" onClick={() => onSelect(item.id)} disabled={disabled}
                          aria-current={active ? 'page' : undefined}
                          className="min-w-0 flex-1 px-3 py-2.5 text-left disabled:cursor-wait">
                          <span className={cn('block truncate text-[12.5px] leading-5', active ? 'font-semibold text-foreground' : 'font-medium text-foreground/85')}>
                            {item.title || 'Untitled conversation'}
                          </span>
                          <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                            {(() => {
                              const date = new Date(item.lastMessageAt || item.updatedAt);
                              return Number.isNaN(date.getTime()) ? 'Conversation' :
                                date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                            })()}
                          </span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" size="icon" variant="ghost" aria-label={'More options for ' + item.title}
                              disabled={disabled}
                              className="mr-1 h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true"/>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[165px] rounded-xl">
                            <DropdownMenuItem className="gap-2" onSelect={() => { setEditingId(item.id); setEditingTitle(item.title); }}>
                              <Pencil className="h-3.5 w-3.5"/> Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator/>
                            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(item)}>
                              <Trash2 className="h-3.5 w-3.5"/> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )) : (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <Search className="mb-3 h-6 w-6 text-muted-foreground/50" aria-hidden="true"/>
            <p className="text-sm font-medium text-foreground">{query ? 'No matching conversations' : 'No conversations yet'}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {query ? 'Try a different search term.' : 'Start a conversation to build your history.'}
            </p>
          </div>
        )}
      </nav>
      <div className="shrink-0 border-t border-border/50 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true"/>
          Access-controlled workspace
        </div>
      </div>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !saving) setDeleteTarget(null); }}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] rounded-2xl border-border bg-background sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title} and its messages will be permanently removed. This does not delete your Actions or Notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (!deleteTarget) return;
                setSaving(true);
                void onDelete(deleteTarget.id).then((success) => {
                  if (success) setDeleteTarget(null);
                }).finally(() => setSaving(false));
              }}>
              {saving ? 'Deleting…' : 'Delete conversation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const starterActions = [
  {
    title: 'Summarize my work', description: 'Get a clear view of recent Actions and progress',
    prompt: 'Summarize my latest Actions and their status.', icon: FolderKanban,
  },
  {
    title: 'Find a decision', description: 'Look for relevant notes and previous context',
    prompt: 'Find my recent notes about decisions and summarize them.', icon: BookOpen,
  },
  {
    title: 'Review checklists', description: 'Spot pending items and blockers',
    prompt: 'Which checklist items are still pending in my Actions?', icon: ListTodo,
  },
  {
    title: 'Plan the next step', description: 'Turn scattered work into a focused plan',
    prompt: 'Help me prioritize my current work for this week.', icon: Lightbulb,
  },
] as const;

export function AIWelcome({ onPrompt, loading }: { onPrompt: (prompt: string) => void; loading: boolean }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[810px] flex-col justify-center px-1 py-9 text-center sm:px-4 sm:py-12">
      <div className="relative mx-auto mb-6 grid h-[72px] w-[72px] place-items-center sm:mb-7 sm:h-20 sm:w-20">
        <div className="absolute inset-0 rounded-[26px] border border-primary/20 bg-gradient-to-br from-primary/15 via-sky-500/10 to-violet-500/10 shadow-[0_20px_55px_-30px_hsl(var(--primary)/0.7)]"/>
        <div className="absolute inset-[10px] rounded-2xl border border-primary/20 bg-background/70"/>
        <Sparkles className="relative h-7 w-7 text-primary sm:h-8 sm:w-8" strokeWidth={1.6} aria-hidden="true"/>
        <span className="absolute -right-2 -top-2 h-3 w-3 rounded-full border-[3px] border-card bg-emerald-500"/>
      </div>
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Your workspace assistant</p>
      <h2 className="text-balance text-[28px] font-semibold leading-[1.13] tracking-[-0.045em] text-foreground sm:text-[39px]">
        Work, clarified.
      </h2>
      <p className="mx-auto mt-3 max-w-[490px] text-pretty text-[13px] leading-6 text-muted-foreground sm:text-sm">
        Make sense of your Actions, notes, checklists and decisions in one place.
        Responses use information you are allowed to access, when available.
      </p>
      <div className="mt-8 grid w-full grid-cols-1 gap-2.5 text-left sm:mt-10 sm:grid-cols-2 sm:gap-3">
        {starterActions.map(({ title, description, prompt, icon: Icon }) => (
          <button key={title} type="button" disabled={loading} onClick={() => onPrompt(prompt)}
            className="group flex min-h-[92px] items-start gap-3.5 rounded-[17px] border border-border/70 bg-background/70 px-4 py-4 text-left shadow-[0_8px_26px_-22px_hsl(var(--foreground)/0.25)] transition-[background-color,border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/45 hover:shadow-[0_15px_30px_-23px_hsl(var(--primary)/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 motion-reduce:transform-none">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.08] text-primary">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true"/>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-foreground">{title}</span>
              <span className="mt-1 block text-[11.5px] leading-[1.55] text-muted-foreground">{description}</span>
            </span>
            <ArrowRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transform-none" aria-hidden="true"/>
          </button>
        ))}
      </div>
      <p className="mt-6 inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/85">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true"/>
        Workspace permissions are respected
      </p>
    </div>
  );
}

export function AIComposer({
  input, setInput, loading, onSend, onStop, contextLabel,
}: {
  input: string; setInput: (value: string) => void; loading: boolean;
  onSend: (value: string) => void; onStop: () => void; contextLabel: string;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = Math.min(168, Math.max(44, element.scrollHeight)) + 'px';
  }, [input]);

  return (
    <footer className="actiproc-ai-composer shrink-0 border-t border-border/60 bg-background/75 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-xl sm:px-6 sm:pb-4 sm:pt-4">
      <form className="mx-auto max-w-[830px]" onSubmit={(event) => { event.preventDefault(); onSend(input); }}>
        <div className="overflow-hidden rounded-[19px] border border-border/80 bg-card/95 shadow-[0_8px_36px_-24px_hsl(var(--foreground)/0.35)] transition-[border-color,box-shadow] focus-within:border-primary/45 focus-within:shadow-[0_8px_38px_-23px_hsl(var(--primary)/0.25)]">
          <div className="flex min-h-[47px] items-center justify-between gap-2 px-3.5 pt-2 sm:px-4">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] font-medium text-muted-foreground">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-3 w-3" aria-hidden="true"/>
              </span>
              <span className="truncate">{contextLabel}</span>
            </span>
            <span className="hidden items-center gap-1.5 text-[10.5px] text-muted-foreground/75 sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true"/>
              Access checked
            </span>
          </div>
          <div className="flex items-end gap-2 px-2.5 pb-2.5 pt-0.5 sm:px-3 sm:pb-3">
            <Textarea ref={textRef} value={input} rows={1} maxLength={12_000}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about Actions, notes, checklists, or your next steps…"
              aria-label="Message Actiproc AI"
              className="max-h-[168px] min-h-[44px] min-w-0 flex-1 resize-none border-0 bg-transparent px-2.5 py-2.5 text-[13.5px] leading-6 shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  onSend(input);
                }
              }}
            />
            {loading ? (
              <Button type="button" aria-label="Stop generating" onClick={onStop}
                className="mb-0.5 h-10 w-10 shrink-0 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive">
                <Square className="h-4 w-4 fill-current" aria-hidden="true"/>
              </Button>
            ) : (
              <Button type="submit" aria-label="Send message" disabled={!input.trim()}
                className="mb-0.5 h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70">
                <ArrowUp className="h-4 w-4" strokeWidth={2.4} aria-hidden="true"/>
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-center text-[10px] leading-4 text-muted-foreground/75">
          <span className="hidden sm:inline">Enter to send · Shift + Enter for new line</span>
          <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block"/>
          <span>AI can make mistakes. Verify important details.</span>
        </div>
      </form>
    </footer>
  );
}

type MessageProps = {
  message: AIChatMessage;
  lastUser: AIChatMessage | undefined;
  proposalBusy: string | null;
  onProposal: (messageId: string, proposalId: string, action: 'approve' | 'reject') => Promise<void>;
  onOpenAction: (taskId: string, checklistItemId?: string | null) => void;
  onRetry: (text: string, failedAssistantMessageId: string) => void;
};

export function AIMessageRow({ message, lastUser, proposalBusy, onProposal, onOpenAction, onRetry }: MessageProps) {
  const isAssistant = message.role === 'assistant';
  const proposal = message.proposal;
  const visibleContent=isAssistant && message.status==='failed'
    ? safeAIErrorMessage(message.errorCode??'unknown',message.content)
    : message.content;
  const retryEligible=message.status==='failed'&&lastUser
    && new Set(['PROVIDER_RATE_LIMITED','PROVIDER_TOKEN_BUDGET','PROVIDER_TIMEOUT',
      'AI_UNAVAILABLE','CITATION_REQUIRED']).has(message.errorCode??'');
  return (
    <article className={cn('group flex w-full gap-3 py-2 sm:gap-4', !isAssistant && 'justify-end')}
      aria-label={isAssistant ? 'Actiproc AI response' : 'Your message'}>
      {isAssistant && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
          <Sparkles className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true"/>
        </div>
      )}
      <div className={cn('min-w-0', isAssistant ? 'w-full max-w-[820px]' : 'max-w-[88%] sm:max-w-[75%]')}>
        {isAssistant && <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
          Actiproc AI <span className="text-[10px] font-normal text-muted-foreground">· Workspace assistant</span>
        </div>}
        <div className={cn(
          'min-w-0',
          isAssistant
            ? 'text-foreground'
            : 'rounded-[17px] rounded-tr-md border border-primary/20 bg-primary/[0.095] px-4 py-3.5 text-foreground sm:px-5 sm:py-4'
        )}>
          {visibleContent ? <SafeAIMessage content={visibleContent} sources={message.sources}/> :
            message.status === 'streaming' ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true"/>
                <span>{message.activity ?? 'Thinking through your request…'}</span>
              </div>
            ) : null}
          {isAssistant && message.status === 'failed' && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">This response wasn't completed. Your question has been preserved.</p>
          )}
          {message.sources.length > 0 && (
            <section className="mt-4 border-t border-border/60 pt-3" aria-label="Verified sources">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true"/> Sources
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {message.sources.map((source, index) => (
                  <button key={source.citationId} type="button"
                    disabled={!source.navigation?.actionId}
                    onClick={() => source.navigation?.actionId && onOpenAction(source.navigation.actionId)}
                    className="min-w-0 rounded-xl border border-border/70 bg-background/65 px-3 py-2.5 text-left transition-colors enabled:hover:border-primary/35 enabled:hover:bg-muted/60 disabled:cursor-default">
                    <span className="block truncate text-[11px] font-semibold text-foreground">
                      <span className="mr-1.5 text-primary">[{index + 1}]</span>{source.title}
                    </span>
                    <span className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-muted-foreground">{source.snippet}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {message.references && message.references.length > 0 && (
            <section className="mt-4 border-t border-border/60 pt-3" aria-label="Related workspace records">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Related work</p>
              <div className="flex flex-wrap gap-2">
                {message.references.slice(0, 12).map((reference) => (
                  <button type="button" key={reference.type + ':' + reference.id}
                    disabled={!reference.actionId}
                    onClick={() => reference.actionId && onOpenAction(reference.actionId, reference.checklistItemId)}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-background/65 px-2.5 py-2 text-left text-[11px] text-foreground transition-colors enabled:hover:border-primary/35 enabled:hover:bg-muted/60 disabled:cursor-default">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true"/>
                    <span className="max-w-[190px] truncate">{reference.title}</span>
                    <span className="shrink-0 text-[10px] capitalize text-muted-foreground">{reference.type}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {proposal && (
            <section className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.045] p-3.5" aria-label="Proposed workspace change">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{proposal.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{proposal.summary}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border/80 bg-background/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{proposal.status}</span>
              </div>
              <p className="mt-3 text-[11px] font-semibold text-foreground">Target: {proposal.targetLabel}</p>
              {proposal.fields.length > 0 && (
                <dl className="mt-2 grid gap-2 text-xs">
                  {proposal.fields.map((field, index) => (
                    <div key={field.label + index} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <dt className="pt-1 text-muted-foreground">{field.label}</dt>
                      <dd className="min-w-0 break-words text-foreground">
                        {field.oldValue !== undefined || field.newValue !== undefined ? (
                          <div className="grid gap-1">
                            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground line-through">{field.oldValue || 'Empty'}</span>
                            <span className="rounded-md bg-primary/10 px-2 py-1 font-medium">{field.newValue || 'Empty'}</span>
                          </div>
                        ) : field.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {proposal.status === 'pending' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" disabled={proposalBusy === proposal.id}
                    className="h-9 gap-1.5 rounded-lg" onClick={() => void onProposal(message.id, proposal.id, 'approve')}>
                    {proposalBusy === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <CheckCheck className="h-3.5 w-3.5"/>}
                    Approve & apply
                  </Button>
                  <Button size="sm" variant="outline" disabled={proposalBusy === proposal.id}
                    className="h-9 gap-1.5 rounded-lg text-foreground hover:text-foreground"
                    onClick={() => void onProposal(message.id, proposal.id, 'reject')}>
                    <X className="h-3.5 w-3.5"/> Reject
                  </Button>
                </div>
              )}
              {proposal.status === 'completed' && proposal.result && (
                <Button size="sm" variant="outline" className="mt-3 h-9 rounded-lg text-foreground hover:text-foreground"
                  disabled={!proposal.result.actionId}
                  onClick={() => proposal.result?.actionId && onOpenAction(proposal.result.actionId, proposal.result.checklistItemId)}>
                  Open updated Action <ArrowRight className="ml-1 h-3.5 w-3.5"/>
                </Button>
              )}
              {proposal.status === 'failed' && <p className="mt-3 text-xs text-destructive">{proposal.error ?? 'Changes were not applied.'}</p>}
              {proposal.status === 'rejected' && <p className="mt-3 text-xs text-muted-foreground">Rejected. No changes were made.</p>}
              {proposal.status === 'expired' && <p className="mt-3 text-xs text-muted-foreground">This proposal has expired. Request a new one.</p>}
            </section>
          )}
        </div>
        {isAssistant && visibleContent && (
          <div className="mt-1.5 flex items-center gap-1 text-muted-foreground opacity-75 transition-opacity group-hover:opacity-100">
            <Button type="button" variant="ghost" size="icon" aria-label="Copy response"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void navigator.clipboard.writeText(visibleContent)
                .then(() => toast.success('Response copied'))
                .catch(() => toast.error('Unable to copy response'))}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true"/>
            </Button>
            {retryEligible && lastUser && (
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => onRetry(lastUser.content,message.id)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true"/> Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
