'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, CheckSquare2,
  Clock3, FileText, FolderOpen, LayoutGrid, List, Pin, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Star, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  formatKnowledgeEntryDate, normalizeKnowledgePinId, searchKnowledgeCards,
  setChecklistItemChecked, type KnowledgeContentFilter, type KnowledgeHubCard,
  type KnowledgeSearchResult,
} from '@/lib/knowledge-retrieval';
import type { Project, Task, TaskUpdateFields } from '@/lib/types';

const PIN_KEY = 'taskflow:pinnedKnowledgeEntryIds';
type LibraryTab = 'all' | 'notes' | 'checklist' | 'pinned' | 'actions';
type Layout = 'cards' | 'list';
type Sort = 'recent' | 'title';

type WorkspaceProps = {
  cards: KnowledgeHubCard[];
  tasks: Task[];
  projects: Project[];
  teamId: string | null;
  loading: boolean;
  notesLoading: boolean;
  notesError: string | null;
  retryNotes: () => Promise<void>;
  openTaskEditor: (taskId: string, checklistItemId?: string | null) => void;
  updateTask: (taskId: string, updates: TaskUpdateFields) => Promise<boolean>;
  canEditTask: (creatorId?: string | null, assigneeId?: string | null) => boolean;
  navigate: (path: string) => void;
};

const tabs: { id: LibraryTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'all', label: 'Overview', icon: LayoutGrid },
  { id: 'notes', label: 'Notes', icon: BookOpen },
  { id: 'checklist', label: 'Checklists', icon: CheckSquare2 },
  { id: 'pinned', label: 'Pinned', icon: Pin },
  { id: 'actions', label: 'All actions', icon: FolderOpen },
];

function cardSummary(card: KnowledgeHubCard): string {
  const note = card.notes.find((item) => item.text.trim()) ?? card.notes[0];
  const unchecked = card.checklistItems.find((item) => !item.done);
  if (note?.text) return note.text;
  if (note?.title) return note.title;
  if (unchecked?.text) return unchecked.text;
  if (card.checklistItems[0]?.text) return card.checklistItems[0].text;
  return 'Open the related action to add notes and structured knowledge.';
}
function hasKnowledge(card: KnowledgeHubCard) {
  return card.notes.length > 0 || card.checklistItems.length > 0;
}
function abbreviatedDate(value: Date) {
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
  } catch {
    return '';
  }
}

export function KnowledgeHubWorkspace({
  cards, tasks, projects, teamId, loading, notesLoading, notesError,
  retryNotes, openTaskEditor, updateTask, canEditTask, navigate,
}: WorkspaceProps) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<LibraryTab>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [visibleCount, setVisibleCount] = useState(24);
  const [layout, setLayout] = useState<Layout>('cards');
  const [pinIds, setPinIds] = useState<string[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
      setPinIds(Array.isArray(data)
        ? [...new Set(data.filter((item): item is string => typeof item === 'string').map(normalizeKnowledgePinId))]
        : []);
    } catch {
      setPinIds([]);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const knowledgeCards = useMemo(
    () => cards.filter((card) => hasKnowledge(card) || pinIds.includes(normalizeKnowledgePinId(card.id))),
    [cards, pinIds],
  );
  const indexedCards = tab === 'actions' || query.trim() ? cards : knowledgeCards;
  const content: KnowledgeContentFilter =
    tab === 'notes' ? 'notes' : tab === 'checklist' ? 'checklist' : 'all';

  const matches = useMemo(
    () => searchKnowledgeCards(indexedCards, { query, content, projectId: projectFilter }),
    [indexedCards, query, content, projectFilter],
  );
  const results = useMemo(() => {
    const items = tab === 'pinned'
      ? matches.filter(({ card }) => pinIds.includes(normalizeKnowledgePinId(card.id)))
      : matches;
    return [...items].sort((left, right) => {
      if (sort === 'title') return left.card.taskTitle.localeCompare(right.card.taskTitle);
      if (!query.trim()) {
        const leftPinned = pinIds.includes(normalizeKnowledgePinId(left.card.id));
        const rightPinned = pinIds.includes(normalizeKnowledgePinId(right.card.id));
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      }
      return right.card.sortDate.getTime() - left.card.sortDate.getTime();
    });
  }, [matches, pinIds, query, sort, tab]);

  useEffect(() => { setVisibleCount(24); }, [query, tab, projectFilter, sort, layout]);
  const displayedResults = results.slice(0, visibleCount);
  const active = cards.find((card) => card.id === activeCardId) ?? null;
  const notesCount = knowledgeCards.reduce((count, card) => count + card.notes.length, 0);
  const checklistCount = knowledgeCards.reduce((count, card) => count + card.checklistItems.length, 0);
  const openItems = knowledgeCards.reduce(
    (count, card) => count + card.checklistItems.filter((item) => !item.done).length, 0,
  );
  const pinnedCount = knowledgeCards.filter((card) => pinIds.includes(normalizeKnowledgePinId(card.id))).length;

  function pin(card: KnowledgeHubCard) {
    const id = normalizeKnowledgePinId(card.id);
    const next = pinIds.includes(id) ? pinIds.filter((item) => item !== id) : [id, ...pinIds];
    setPinIds(next);
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(next));
    } catch {
      toast.error('Pinned items could not be saved on this device.');
    }
  }
  function clearFilters() {
    setQuery('');
    setTab('all');
    setProjectFilter('all');
    setSort('recent');
  }
  function askAI() {
    const params = new URLSearchParams({ origin: 'knowledge_hub' });
    if (teamId) params.set('teamId', teamId);
    if (projectFilter !== 'all' && projectFilter !== '__none__') params.set('processId', projectFilter);
    navigate('/ai?' + params.toString());
  }
  async function toggleChecklistItem(card: KnowledgeHubCard, itemId: string, nextChecked: boolean) {
    const item = card.checklistItems.find((candidate) => candidate.id === itemId);
    const task = taskMap.get(card.taskId);
    if (!item?.persistedId || !task || !canEditTask(task.createdBy, task.assigneeId) || savingItemId) return;
    const next = setChecklistItemChecked(task.checklistBlocks, item.persistedId, nextChecked);
    if (!next) {
      toast.error('This checklist item can no longer be updated. Open the action to refresh it.');
      return;
    }
    setSavingItemId(itemId);
    try {
      const ok = await updateTask(task.id, { checklistBlocks: next });
      if (!ok) toast.error('Checklist change was not saved.');
    } catch {
      toast.error('Checklist change was not saved.');
    } finally {
      setSavingItemId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-3 pb-14 pt-2 text-foreground sm:px-5 lg:px-8">
      <header className="relative isolate overflow-hidden rounded-[26px] border border-[#283a56] bg-[#101d30] p-6 text-white shadow-[0_24px_70px_-42px_rgba(6,15,32,0.6)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 h-80 w-80 rounded-full bg-blue-500/20 blur-[90px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-1/3 h-60 w-72 rounded-full bg-indigo-500/15 blur-[70px]" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Your team's second brain
            </div>
            <h1 className="text-[28px] font-semibold tracking-tight sm:text-[35px]">Knowledge Hub</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Find important notes, decisions and checklists without digging through every action.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Button type="button" onClick={askAI} className="h-10 rounded-xl bg-blue-500 px-4 text-[13px] font-semibold text-[#08172c] shadow-[0_12px_26px_-16px_rgba(59,130,246,0.9)] hover:bg-blue-400">
                <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Ask Actiproc AI
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/board')} className="h-10 rounded-xl border-white/20 bg-white/[0.075] px-4 text-[13px] text-white hover:bg-white/[0.15] hover:text-white">
                Open workspace <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:min-w-[265px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.065] p-4 backdrop-blur-sm">
              <BookOpen className="h-4 w-4 text-sky-300" aria-hidden />
              <p className="mt-3 text-2xl font-semibold tabular-nums">{notesCount}</p>
              <p className="mt-0.5 text-[11px] text-slate-300">Saved notes</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.065] p-4 backdrop-blur-sm">
              <CheckSquare2 className="h-4 w-4 text-emerald-300" aria-hidden />
              <p className="mt-3 text-2xl font-semibold tabular-nums">{openItems}</p>
              <p className="mt-0.5 text-[11px] text-slate-300">Open checklist items</p>
            </div>
          </div>
        </div>
      </header>

      <section aria-label="Knowledge overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Knowledge entries', value: knowledgeCards.length, icon: FileText, tone: 'text-blue-500 bg-blue-500/10' },
          { label: 'Notes', value: notesCount, icon: BookOpen, tone: 'text-violet-500 bg-violet-500/10' },
          { label: 'Checklist items', value: checklistCount, icon: CheckCircle2, tone: 'text-emerald-500 bg-emerald-500/10' },
          { label: 'Pinned', value: pinnedCount, icon: Star, tone: 'text-amber-500 bg-amber-500/10' },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 rounded-[19px] border border-border/70 bg-card p-4 shadow-[0_9px_28px_-24px_rgba(15,23,42,0.4)]">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.tone)}>
              <stat.icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold tabular-nums">{stat.value}</p>
              <p className="truncate text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-[24px] border border-border/70 bg-card p-4 shadow-[0_14px_42px_-34px_rgba(15,23,42,0.4)] sm:p-5" aria-label="Find knowledge">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes, actions, decisions..."
              aria-label="Search Knowledge Hub"
              className="h-11 rounded-xl border-border/80 bg-muted/20 pl-10 pr-10 text-[13px] shadow-none focus-visible:ring-primary/30"
            />
            {query ? (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">/</kbd>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger aria-label="Filter by process" className="h-11 w-full rounded-xl border-border/80 bg-muted/20 text-xs sm:w-[210px]">
                <FolderOpen className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue placeholder="All processes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All processes</SelectItem>
                <SelectItem value="__none__">No process</SelectItem>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
              <SelectTrigger aria-label="Sort knowledge" className="h-11 w-full rounded-xl border-border/80 bg-muted/20 text-xs sm:w-[150px]">
                <SlidersHorizontal className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently updated</SelectItem>
                <SelectItem value="title">Title A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <div role="group" aria-label="Knowledge collection" className="flex min-w-0 flex-wrap gap-1.5">
            {tabs.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              return (
                <button key={item.id} type="button" aria-pressed={selected}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3 sm:text-xs',
                    selected ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/70 bg-muted/25 p-1" role="group" aria-label="Result display">
            <button type="button" aria-label="Card view" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', layout === 'cards' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', layout === 'list' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <List className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </section>

      {notesError && !notesLoading && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs">
          <p>Notes could not be loaded. Checklist and action results may still be available.</p>
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => void retryNotes()}>Retry notes</Button>
        </div>
      )}

      <main aria-label="Knowledge results" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Your library</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
              {tab === 'pinned' ? 'Pinned knowledge' : tab === 'notes' ? 'Saved notes' : tab === 'checklist' ? 'Checklists' : tab === 'actions' ? 'All actions' : 'Explore knowledge'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <p role="status" aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
              {loading || notesLoading ? 'Loading…' : String(results.length) + ' entries'}
            </p>
            {(query || tab !== 'all' || projectFilter !== 'all') && (
              <button type="button" onClick={clearFilters} className="text-xs font-medium text-primary underline-offset-4 hover:underline">Clear filters</button>
            )}
          </div>
        </div>

        {loading || notesLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading knowledge entries" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-[232px] animate-pulse rounded-[21px] border border-border/60 bg-muted/30" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[290px] flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-card p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="mt-4 text-base font-semibold">
              {cards.length === 0 ? 'Your knowledge starts with an action' : 'No matching knowledge found'}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {cards.length === 0
                ? 'Create an action and add notes or checklist items. They will appear here automatically.'
                : tab === 'pinned'
                  ? 'Nothing pinned yet. Pin important entries to find them quickly later on this device.'
                  : knowledgeCards.length === 0 && !query && tab !== 'actions'
                  ? 'No notes or checklist items yet. Open an action to capture your next idea or decision.'
                  : 'Try another keyword, process or collection. Search can also find actions that do not have notes yet.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button type="button" className="h-10 rounded-xl" onClick={() => navigate('/board')}>
                Open board <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Button>
              {cards.length > 0 && <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={clearFilters}>Reset view</Button>}
            </div>
          </div>
        ) : (
          <div className={cn('grid gap-4', layout === 'cards' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1')}>
            {displayedResults.map((result: KnowledgeSearchResult) => {
              const { card, matches: sourceMatches } = result;
              const isPinned = pinIds.includes(normalizeKnowledgePinId(card.id));
              const completed = card.checklistItems.filter((item) => item.done).length;
              const firstMatch = query.trim() ? sourceMatches.find((item) => item.sourceType !== 'action') ?? sourceMatches[0] : null;
              const snippet = firstMatch?.snippet || cardSummary(card);
              const previewLabel = firstMatch ? 'Matched ' + firstMatch.label :
                card.notes.length > 0 ? 'From your notes' : card.checklistItems.length ? 'From your checklist' : 'Related action';
              return (
                <article key={card.id}
                  className={cn(
                    'group relative flex min-w-0 flex-col overflow-hidden rounded-[21px] border border-border/70 bg-card shadow-[0_10px_35px_-30px_rgba(15,23,42,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-27px_rgba(15,23,42,0.35)]',
                    layout === 'list' ? 'sm:flex-row sm:items-center' : 'min-h-[240px]',
                  )}>
                  <button type="button" onClick={() => setActiveCardId(card.id)} aria-label={'Read ' + card.taskTitle}
                    className={cn('min-w-0 flex-1 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary', layout === 'cards' && 'flex flex-col')}>
                    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                      {card.notes.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-1 text-violet-600 dark:text-violet-300"><BookOpen className="h-3 w-3" aria-hidden /> Notes · {card.notes.length}</span>}
                      {card.checklistItems.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300"><CheckSquare2 className="h-3 w-3" aria-hidden /> {completed}/{card.checklistItems.length} done</span>}
                      {!hasKnowledge(card) && <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">Action</span>}
                    </div>
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">
                      {card.taskTitle}
                    </h3>
                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{previewLabel}</p>
                    <p className={cn('mt-1 break-words text-[12px] leading-relaxed text-muted-foreground', layout === 'cards' ? 'line-clamp-3' : 'line-clamp-2')}>
                      {snippet}
                    </p>
                    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground', layout === 'cards' ? 'mt-auto pt-4' : 'mt-4')}>
                      <span className="flex min-w-0 max-w-full items-center gap-1.5"><FolderOpen className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{card.projectName ?? 'No process'}</span></span>
                      <span className="flex shrink-0 items-center gap-1.5"><Clock3 className="h-3 w-3" aria-hidden />{abbreviatedDate(card.sortDate)}</span>
                    </div>
                  </button>
                  <button type="button" aria-label={isPinned ? 'Unpin ' + card.taskTitle : 'Pin ' + card.taskTitle}
                    aria-pressed={isPinned} onClick={() => pin(card)}
                    className={cn('absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      isPinned && 'border-amber-500/25 bg-amber-500/[0.09] text-amber-500',
                      layout === 'list' && 'sm:static sm:mr-4 sm:shrink-0')}>
                    <Star className={cn('h-4 w-4', isPinned && 'fill-current')} aria-hidden />
                  </button>
                </article>
              );
            })}
          </div>
        )}
        {!loading && !notesLoading && results.length > visibleCount && (
          <div className="flex flex-col items-center gap-2 pt-3">
            <p className="text-[11px] tabular-nums text-muted-foreground">Showing {displayedResults.length} of {results.length} entries</p>
            <Button type="button" variant="outline" className="h-10 rounded-xl border-border/80 px-5 text-xs font-semibold shadow-sm"
              onClick={() => setVisibleCount((count) => count + 24)}>
              Show more knowledge <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </main>

      <Sheet open={Boolean(active)} onOpenChange={(isOpen) => { if (!isOpen) setActiveCardId(null); }}>
        <SheetContent side="right" className="z-[431] flex h-full w-full max-w-full flex-col gap-0 overflow-y-auto border-l border-border/70 bg-background p-0 shadow-2xl sm:w-[580px] sm:max-w-[580px]">
          {active && (
            <>
              <div className="border-b border-border/70 bg-gradient-to-br from-primary/[0.07] via-card to-card px-6 pb-6 pt-8 sm:px-8">
                <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1">Knowledge detail</span>
                  {active.projectName && <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">{active.projectName}</span>}
                </div>
                <SheetHeader className="pr-6 text-left">
                  <SheetTitle className="break-words text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{active.taskTitle}</SheetTitle>
                  <SheetDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden />{active.teamName}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden />Updated {formatKnowledgeEntryDate(active.sortDate)}</span>
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => { const taskId=active.taskId; setActiveCardId(null); openTaskEditor(taskId); }} className="h-10 rounded-xl px-4 text-xs font-semibold">
                    Open full action <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button type="button" variant="outline" className="h-10 rounded-xl text-xs" onClick={() => pin(active)}>
                    <Star className={cn('mr-1.5 h-3.5 w-3.5', pinIds.includes(normalizeKnowledgePinId(active.id)) && 'fill-amber-400 text-amber-500')} aria-hidden />
                    {pinIds.includes(normalizeKnowledgePinId(active.id)) ? 'Unpin' : 'Pin'}
                  </Button>
                </div>
              </div>
              <div className="flex-1 space-y-7 px-6 py-6 sm:px-8">
                <section aria-label="Saved notes">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-violet-500" aria-hidden /> Notes &amp; decisions</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{active.notes.length}</span>
                  </div>
                  {active.notes.length ? (
                    <div className="space-y-3">
                      {active.notes.map((note) => (
                        <div key={note.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-semibold capitalize text-violet-600 dark:text-violet-300">{note.type}</span>
                            <span className="text-muted-foreground">{abbreviatedDate(new Date(note.updatedAt))}</span>
                          </div>
                          {note.title && <h4 className="mt-3 break-words text-sm font-semibold">{note.title}</h4>}
                          <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-[1.75] text-foreground/85">{note.text || 'No note text.'}</p>
                          {note.authorName && <p className="mt-3 text-[11px] text-muted-foreground">By {note.authorName}</p>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">No notes on this action yet.</p>}
                </section>
                <section aria-label="Checklist items">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><CheckSquare2 className="h-4 w-4 text-emerald-500" aria-hidden /> Checklist</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {active.checklistItems.filter((item) => item.done).length}/{active.checklistItems.length}
                    </span>
                  </div>
                  {active.checklistItems.length ? (
                    <ul className="space-y-2">
                      {active.checklistItems.map((item) => {
                        const task = taskMap.get(active.taskId);
                        const editable = task && canEditTask(task.createdBy, task.assigneeId);
                        return (
                          <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3">
                            <Checkbox checked={item.done} disabled={!editable || !item.persistedId || Boolean(savingItemId)}
                              aria-label={'Mark checklist item ' + item.text + ' as ' + (item.done ? 'incomplete' : 'complete')}
                              onCheckedChange={(checked) => void toggleChecklistItem(active, item.id, checked === true)}
                              className="mt-0.5 shrink-0" />
                            <span className={cn('min-w-0 flex-1 break-words text-[13px] leading-relaxed', item.done && 'text-muted-foreground line-through')}>{item.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">No checklist items on this action.</p>}
                  {active.checklistItems.some((item) => !item.persistedId) &&
                    <p className="mt-2 text-[11px] text-muted-foreground">Older checklist items without stored IDs must be edited in their original action.</p>}
                </section>
              </div>
              <div className="sticky bottom-0 border-t border-border/70 bg-background/95 px-6 py-4 backdrop-blur-sm sm:px-8">
                <p className="flex items-center gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Content stays linked to its original action. Edits follow your workspace permissions.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
