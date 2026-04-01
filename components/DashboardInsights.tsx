'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTaskContext } from '@/components/TaskContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  buildKnowledgeHubCards,
  knowledgeMapsFromContext,
  formatKnowledgeEntryDate,
  normalizeKnowledgePinId,
  type KnowledgeHubCard,
} from '@/lib/knowledge-entries';
import {
  FALLBACK_BOARD_COLUMNS,
  resolveTaskBoardColumnId,
  isTerminalBoardColumn,
  type Project,
  type ProjectColumnConfig,
} from '@/lib/types';
import { BookOpen, Brain, ChevronRight, FileText, Layers, Lightbulb, LayoutGrid, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

function projectColumns(p: Project): ProjectColumnConfig[] {
  return p.columnConfig?.length ? p.columnConfig : FALLBACK_BOARD_COLUMNS;
}

const COLORS = [
  'bg-violet-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-blue-500',
];

function hubCardPreview(c: KnowledgeHubCard): string {
  const first = c.checklistItems[0]?.text;
  if (first) return first;
  if (c.learningsPreview) return c.learningsPreview;
  return c.taskTitle;
}

function hubCardIsLearningOnly(c: KnowledgeHubCard): boolean {
  return !!c.learningsPreview && c.checklistItems.length === 0;
}

export function DashboardInsights() {
  const { tasks, projects, teams, currentTeam, loading, openTaskEditor } = useTaskContext();
  const router = useRouter();
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const { projectNameById, teamNameById } = useMemo(
    () => knowledgeMapsFromContext(projects, teams),
    [projects, teams]
  );

  const allKnowledgeCards = useMemo(
    () => buildKnowledgeHubCards(tasks, projectNameById, teamNameById),
    [tasks, projectNameById, teamNameById]
  );

  const recentFeed = useMemo(() => allKnowledgeCards.slice(0, 5), [allKnowledgeCards]);

  const projectsForTeam = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((p) => !p.teamId || p.teamId === currentTeam.id);
  }, [projects, currentTeam]);

  const processSummaries = useMemo(() => {
    return projectsForTeam.map((p) => {
      const cols = projectColumns(p);
      const pt = tasks.filter((t) => t.projectId === p.id);
      const total = pt.length;
      const terminal = pt.filter((t) => isTerminalBoardColumn(t.status, cols)).length;
      const pct = total === 0 ? 0 : Math.round((terminal / total) * 100);
      const byCol = cols.map((col) => ({
        ...col,
        count: pt.filter((t) => resolveTaskBoardColumnId(t.status, cols) === col.id).length,
      }));
      return { project: p, cols, pt, total, terminal, pct, byCol };
    });
  }, [projectsForTeam, tasks]);

  const openKnowledgeHub = () => router.push('/dashboard/knowledge-hub');
  const openSettings = () => router.push('/dashboard/processes');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('taskflow:pinnedKnowledgeEntryIds');
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      const list = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
      setPinnedIds(list.map(normalizeKnowledgePinId));
    } catch {
      setPinnedIds([]);
    }
  }, []);

  const togglePinned = (entryId: string) => {
    const normalized = normalizeKnowledgePinId(entryId);
    setPinnedIds((prev) => {
      const next = prev.includes(normalized)
        ? prev.filter((x) => x !== normalized)
        : [normalized, ...prev];
      try {
        localStorage.setItem('taskflow:pinnedKnowledgeEntryIds', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const pinnedEntries = useMemo(() => {
    if (pinnedIds.length === 0) return [];
    const byId = new Map(allKnowledgeCards.map((c) => [c.id, c]));
    return pinnedIds.map((id) => byId.get(id)).filter(Boolean) as KnowledgeHubCard[];
  }, [allKnowledgeCards, pinnedIds]);

  const topProcessSummaries = useMemo(() => {
    return [...processSummaries]
      .sort((a, b) => {
        // Prioritize active processes: more tasks first, then lower completion.
        if (b.total !== a.total) return b.total - a.total;
        return a.pct - b.pct;
      })
      .slice(0, 4);
  }, [processSummaries]);

  return (
    <div className="grid gap-4 lg:grid-cols-2 mb-8">
      <Card className="border-violet-200/60 dark:border-violet-900/50 shadow-sm overflow-hidden flex flex-col lg:h-[360px]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-gradient-to-r from-violet-500/8 to-transparent">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Son bilgiler
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 gap-0.5 text-xs" onClick={openKnowledgeHub}>
            Bilgi merkezi
            <ChevronRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="pt-4 flex-1 overflow-auto pr-1 flex flex-col">
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : recentFeed.length === 0 ? (
            <div className="rounded-xl border border-dashed border-violet-200/80 dark:border-violet-900/50 bg-violet-500/5 dark:bg-violet-950/20 px-4 py-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Lightbulb className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">
                Henüz bir kazanım kaydı yok
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Bir aksiyonda Kazanımlar veya kontrol listesi ekleyin; burada en yeni kayıtlar görünür.
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push('/board')}>
                <LayoutGrid className="h-3.5 w-3.5" />
                Panoya git
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {pinnedEntries.length > 0 && (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2">
                      <Star className="h-3.5 w-3.5" />
                      Pinned
                    </p>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openKnowledgeHub}>
                      Tümü
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                  <ul className="space-y-2">
                    {pinnedEntries.slice(0, 3).map((entry) => (
                      <li key={entry.id}>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openTaskEditor(entry.taskId)}
                            className={cn(
                              'flex-1 text-left rounded-lg border border-border/80 p-2.5 transition-colors',
                              'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm line-clamp-1 text-foreground">{hubCardPreview(entry)}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.taskTitle}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                {formatKnowledgeEntryDate(entry.sortDate)}
                              </span>
                            </div>
                          </button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            onClick={() => togglePinned(entry.id)}
                            aria-label="Unpin"
                            title="Unpin"
                          >
                            <Star className="h-4 w-4 fill-current" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ul className="space-y-3">
                {recentFeed.map((entry: KnowledgeHubCard) => (
                  <li key={entry.id}>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openTaskEditor(entry.taskId)}
                        className={cn(
                          'flex-1 text-left rounded-lg border border-border/80 p-3 transition-colors',
                          'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-start gap-2 min-w-0 flex-wrap">
                            {hubCardIsLearningOnly(entry) ? (
                              <BookOpen className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            )}
                            <span className="text-xs font-medium text-muted-foreground tabular-nums">
                              {formatKnowledgeEntryDate(entry.sortDate)}
                            </span>
                            {entry.projectName && (
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                                {entry.projectName}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-sm line-clamp-2 text-foreground">{hubCardPreview(entry)}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{entry.taskTitle}</p>
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-12 w-12"
                        onClick={() => togglePinned(entry.id)}
                        aria-label={pinnedIds.includes(normalizeKnowledgePinId(entry.id)) ? 'Unpin' : 'Pin'}
                        title={pinnedIds.includes(normalizeKnowledgePinId(entry.id)) ? 'Unpin' : 'Pin'}
                      >
                        <Star
                          className={cn(
                            'h-4 w-4',
                            pinnedIds.includes(normalizeKnowledgePinId(entry.id)) && 'fill-current'
                          )}
                        />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onClick={openKnowledgeHub}
                >
                  Knowledge Hub’a git
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-cyan-200/60 dark:border-cyan-900/50 shadow-sm overflow-hidden flex flex-col lg:h-[360px]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-gradient-to-r from-cyan-500/8 to-transparent">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Aktif süreç özeti
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 gap-0.5 text-xs" onClick={openSettings}>
            Yönet
            <ChevronRight className="h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="pt-4 flex-1 overflow-auto pr-1 space-y-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : processSummaries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-cyan-200/80 dark:border-cyan-900/50 bg-cyan-500/5 dark:bg-cyan-950/20 px-4 py-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <Layers className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">Henüz süreç (proje) yok</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Veritabanında <code className="text-xs bg-muted px-1 rounded">projects</code> kaydı oluşturduğunda burada
                aşama sayısı ve yoğunluk özeti görünür; panoda süreç seçerek görevleri o akışa bağlarsın.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {processSummaries.every((s) => s.total === 0) && (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed bg-muted/40 px-3 py-2.5">
                  Bu süreçlerde henüz aksiyon yok. Panodan aksiyon ekleyerek ilerleme çubukları ve aşama dağılımı dolar.
                </p>
              )}
              {topProcessSummaries.map(({ project, total, terminal, pct, byCol }) => (
              <div key={project.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{project.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {byCol.length} aşama · {terminal}/{total} bitti
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
                <div
                  className="flex h-2 rounded-full overflow-hidden bg-muted gap-px"
                  title={byCol.map((c) => `${c.title}: ${c.count}`).join(' · ')}
                >
                  {total === 0 ? (
                    <div className="flex-1 bg-muted-foreground/15" />
                  ) : (
                    byCol.map((c, i) => (
                      <div
                        key={c.id}
                        className={cn(COLORS[i % COLORS.length], 'min-w-[4px] transition-all')}
                        style={{ width: `${(c.count / total) * 100}%` }}
                      />
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {byCol.map((c, i) => (
                    <Badge key={c.id} variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                      <span className={cn('h-1.5 w-1.5 rounded-full', COLORS[i % COLORS.length])} />
                      {c.title}: {c.count}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
              {processSummaries.length > topProcessSummaries.length && (
                <Button variant="outline" size="sm" className="w-full" onClick={openSettings}>
                  Tüm süreçleri gör ({processSummaries.length})
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
