'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTaskContext } from '@/components/TaskContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BookOpen, FileText, Inbox, Search, Sparkles, LayoutGrid, Star } from 'lucide-react';
import {
  buildKnowledgeHubCards,
  formatKnowledgeEntryDate,
  knowledgeMapsFromContext,
  normalizeKnowledgePinId,
  type KnowledgeEntryType,
  type KnowledgeHubCard,
} from '@/lib/knowledge-entries';
export type { KnowledgeEntryType, KnowledgeHubCard } from '@/lib/knowledge-entries';

const PIN_KEY = 'taskflow:pinnedKnowledgeEntryIds';

export function KnowledgeHubView() {
  const router = useRouter();
  const { tasks, projects, teams, currentTeam, loading, openTaskEditor, updateTask, canEditTask } =
    useTaskContext();
  const [query, setQuery] = useState('');
  type TypeFilter = 'all' | KnowledgeEntryType;
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const tasksScoped = useMemo(() => {
    if (!currentTeam) return tasks;
    return tasks.filter((t) => t.teamId === currentTeam.id);
  }, [tasks, currentTeam]);

  const projectsScoped = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((p) => !p.teamId || p.teamId === currentTeam.id);
  }, [projects, currentTeam]);

  const { projectNameById, teamNameById } = useMemo(
    () => knowledgeMapsFromContext(projectsScoped, teams),
    [projectsScoped, teams]
  );

  const allCards = useMemo(
    () => buildKnowledgeHubCards(tasksScoped, projectNameById, teamNameById),
    [tasksScoped, projectNameById, teamNameById]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCards.filter((c) => {
      if (typeFilter === 'learnings' && !c.learningsPreview) return false;
      if (typeFilter === 'action_notes' && c.checklistItems.length === 0) return false;
      if (projectFilter !== 'all') {
        if (projectFilter === '__none__') {
          if (c.projectId != null) return false;
        } else if (c.projectId !== projectFilter) return false;
      }
      if (!q) return true;
      const hay = [
        c.taskTitle,
        c.projectName ?? '',
        c.teamName,
        c.learningsPreview ?? '',
        ...c.checklistItems.map((i) => i.text),
        // search helpers
        'learning',
        'learnings',
        'journal',
        'notes',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allCards, query, typeFilter, projectFilter]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      const list = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
      setPinnedIds(list.map(normalizeKnowledgePinId));
    } catch {
      setPinnedIds([]);
    }
  }, []);

  const persistPins = (next: string[]) => {
    setPinnedIds(next);
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const togglePin = (cardId: string) => {
    const id = normalizeKnowledgePinId(cardId);
    persistPins(pinnedIds.includes(id) ? pinnedIds.filter((x) => x !== id) : [id, ...pinnedIds]);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-violet-500/10 via-background to-cyan-500/10',
          'p-8 md:p-10'
        )}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-0 -left-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-3">
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">Second brain</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Knowledge Hub</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            Your action <span className="text-foreground/90">learnings</span> (free-form notes) and{' '}
            <span className="text-foreground/90">journal notes</span> (checklist items in the action journal) are collected here.
            You can tick items without opening the board—click a card for full details.
          </p>
        </div>
      </div>

      <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-11 bg-background pl-10"
            aria-label="Knowledge Hub search"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="h-11 w-full sm:w-[220px]">
            <SelectValue placeholder="Content" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All content</SelectItem>
            <SelectItem value="learnings">Learnings</SelectItem>
            <SelectItem value="action_notes">Journal notes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="h-11 w-full sm:min-w-[220px]">
            <SelectValue placeholder="Process" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All processes</SelectItem>
            <SelectItem value="__none__">No process</SelectItem>
            {projectsScoped.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : allCards.length === 0 ? (
        <div className="columns-1 gap-4 [column-fill:_balance] md:columns-2 lg:columns-3 xl:columns-4">
          <div className="mb-4 break-inside-avoid">
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/60 shadow-md dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="h-1.5 w-full rounded-t-lg bg-amber-500/70" />
              <div className="p-4">
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  Journal
                </Badge>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  Example: meeting note, interview item…
                </p>
              </div>
            </div>
          </div>
          <div className="mb-4 break-inside-avoid">
            <Card className="border-dashed border-violet-200/70 shadow-sm dark:border-violet-900/50">
              <CardContent className="space-y-4 px-5 py-10 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-cyan-500/10 text-violet-600 dark:text-violet-400">
                    <Inbox className="h-6 w-6" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">No notes yet</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Open an action on the board and add journal notes or learnings—quick capture can also land items in Inbox.
                    </p>
                    <Button variant="default" className="mt-4 gap-2" onClick={() => router.push('/board')}>
                      <LayoutGrid className="h-4 w-4" />
                      Go to board
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="columns-1 gap-4 [column-fill:_balance] md:columns-2 lg:columns-3 xl:columns-4">
          <div className="mb-4 break-inside-avoid">
            <Card className="border-dashed shadow-sm">
              <CardContent className="space-y-2 p-5 text-muted-foreground">
                <p className="font-medium text-foreground">No results</p>
                <p className="text-sm">Try resetting your filters or search.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="columns-1 gap-4 [column-fill:_balance] md:columns-2 lg:columns-3 xl:columns-4">
          {filtered.map((card) => {
            const pinId = normalizeKnowledgePinId(card.id);
            const isPinned = pinnedIds.includes(pinId);
            const hasLearn = !!card.learningsPreview;
            const hasList = card.checklistItems.length > 0;
            const accent = hasLearn && !hasList ? 'emerald' : 'amber';

            return (
              <div key={card.id} className="mb-4 break-inside-avoid">
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => openTaskEditor(card.taskId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openTaskEditor(card.taskId);
                    }
                  }}
                  className={cn(
                    'group cursor-pointer overflow-hidden rounded-lg border shadow-md transition-shadow hover:shadow-lg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    accent === 'emerald'
                      ? 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                      : 'border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
                  )}
                >
                  <div
                    className={cn('h-1 w-full', accent === 'emerald' ? 'bg-emerald-500/70' : 'bg-amber-500/70')}
                  />
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex flex-wrap items-center gap-2">
                        {hasLearn ? (
                          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                            <BookOpen className="h-3 w-3" />
                            Learnings
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <FileText className="h-3 w-3" />
                            Journal
                          </Badge>
                        )}
                        {isPinned && <span aria-label="Pinned">⭐</span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={isPinned ? 'Unpin' : 'Pin'}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePin(card.id);
                          }}
                        >
                          <Star className={cn('h-4 w-4', isPinned && 'fill-current')} />
                        </Button>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {formatKnowledgeEntryDate(card.sortDate)}
                        </span>
                      </div>
                    </div>

                    <p className="mb-3 line-clamp-2 text-base font-medium leading-snug text-foreground">
                      {card.taskTitle}
                    </p>

                    {hasList && (
                      <ul className="mb-3 space-y-1.5">
                        {card.checklistItems.slice(0, 10).map((item) => {
                          const task = tasks.find((t) => t.id === card.taskId);
                          const editable = task ? canEditTask(task.createdBy, task.assigneeId) : false;
                          return (
                            <li
                              key={item.id}
                              className="flex items-start gap-2 text-sm leading-relaxed"
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={item.done}
                                disabled={!editable}
                                className="mt-0.5"
                                onCheckedChange={(v) => {
                                  const t = tasks.find((x) => x.id === card.taskId);
                                  if (!t || !editable) return;
                                  const next = (t.journalLogs ?? []).map((row) =>
                                    row.id === item.id ? { ...row, done: v === true } : row
                                  );
                                  void updateTask(card.taskId, { journalLogs: next });
                                }}
                              />
                              <span
                                className={cn(
                                  'min-w-0 flex-1 [overflow-wrap:anywhere]',
                                  item.done && 'text-muted-foreground line-through'
                                )}
                              >
                                {item.text}
                              </span>
                            </li>
                          );
                        })}
                        {card.checklistItems.length > 10 && (
                          <li className="text-xs text-muted-foreground">+{card.checklistItems.length - 10} more…</li>
                        )}
                      </ul>
                    )}

                    {hasLearn && (
                      <p className="mb-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">
                        {card.learningsPreview}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {card.projectName ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-normal',
                            accent === 'emerald'
                              ? 'border-emerald-200/80 bg-background/50 dark:border-emerald-900/50'
                              : 'border-amber-200/80 bg-background/50 dark:border-amber-900/50'
                          )}
                        >
                          {card.projectName}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          No process
                        </Badge>
                      )}
                      <Badge variant="outline" className="font-normal">
                        {card.teamName}
                      </Badge>
                    </div>

                    <p className="mt-2 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      Click for details
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {!loading && allCards.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {filtered.length} / {allCards.length} cards
        </p>
      )}
    </div>
  );
}
