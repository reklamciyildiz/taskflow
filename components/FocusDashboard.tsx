'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTaskContext } from '@/components/TaskContext';
import { useView } from '@/components/ViewContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { JournalLogEntry } from '@/lib/types';
import { FALLBACK_BOARD_COLUMNS, isTerminalBoardColumn } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, Flame, Star, ChevronRight, PenLine } from 'lucide-react';

const PINNED_PROJECTS_KEY = 'taskflow:pinnedProjectIds';
const RECENT_PROJECTS_KEY = 'taskflow:recentProjectIds';
const LOGGING_TASK_BY_PROJECT_KEY = 'taskflow:loggingTaskByProjectId';

function safeParseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function FocusDashboard() {
  const router = useRouter();
  const { setCurrentView } = useView();
  const {
    tasks,
    projects,
    currentTeam,
    setCurrentProjectId,
    updateTask,
    canEditTask,
  } = useTaskContext();

  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>([]);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const [loggingTaskByProjectId, setLoggingTaskByProjectId] = useState<Record<string, string>>({});
  const [draftByProjectId, setDraftByProjectId] = useState<Record<string, string>>({});
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Which project card has the "varsayılan günlük aksiyon" combobox open (controlled close on select). */
  const [loggingTaskPickerProjectId, setLoggingTaskPickerProjectId] = useState<string | null>(null);

  useEffect(() => {
    setPinnedProjectIds(safeParseStringArray(localStorage.getItem(PINNED_PROJECTS_KEY)));
    setRecentProjectIds(safeParseStringArray(localStorage.getItem(RECENT_PROJECTS_KEY)));
    try {
      const raw = localStorage.getItem(LOGGING_TASK_BY_PROJECT_KEY);
      const v = raw ? (JSON.parse(raw) as unknown) : {};
      setLoggingTaskByProjectId(
        v && typeof v === 'object' && !Array.isArray(v)
          ? (Object.fromEntries(
              Object.entries(v as Record<string, unknown>).filter(
                ([k, val]) => typeof k === 'string' && typeof val === 'string'
              )
            ) as Record<string, string>)
          : {}
      );
    } catch {
      setLoggingTaskByProjectId({});
    }
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const projectsForTeam = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((p) => !p.teamId || p.teamId === currentTeam.id);
  }, [projects, currentTeam?.id]);

  const projectStats = useMemo(() => {
    const byProjectId = new Map<
      string,
      { total: number; done: number; pct: number; hottestTaskId: string | null; recentTaskIds: string[] }
    >();

    for (const p of projectsForTeam) {
      const pt = tasks.filter((t) => t.projectId === p.id);
      const total = pt.length;
      const cols = p.columnConfig?.length ? p.columnConfig : FALLBACK_BOARD_COLUMNS;
      const done = pt.filter((t) => isTerminalBoardColumn(t.status, cols)).length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      const sorted = [...pt].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const hottest = sorted[0] ?? null;
      const recentTaskIds = sorted.slice(0, 12).map((t) => t.id);
      byProjectId.set(p.id, { total, done, pct, hottestTaskId: hottest?.id ?? null, recentTaskIds });
    }
    return byProjectId;
  }, [projectsForTeam, tasks]);

  const focusProjects = useMemo(() => {
    const byId = new Map(projectsForTeam.map((p) => [p.id, p]));

    const pick: string[] = [];
    const add = (id: string) => {
      if (!id) return;
      if (!byId.has(id)) return;
      if (pick.includes(id)) return;
      pick.push(id);
    };

    pinnedProjectIds.forEach(add);
    recentProjectIds.forEach(add);

    // Fill remaining slots with most active (task count desc)
    const fallback = [...projectsForTeam]
      .sort((a, b) => (projectStats.get(b.id)?.total ?? 0) - (projectStats.get(a.id)?.total ?? 0))
      .map((p) => p.id);
    fallback.forEach(add);

    return pick.slice(0, 5).map((id) => byId.get(id)!);
  }, [pinnedProjectIds, recentProjectIds, projectsForTeam, projectStats]);

  const togglePinProject = (projectId: string) => {
    setPinnedProjectIds((prev) => {
      const next = prev.includes(projectId)
        ? prev.filter((x) => x !== projectId)
        : [projectId, ...prev];
      localStorage.setItem(PINNED_PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openProjectBoard = (projectId: string) => {
    setCurrentView('board');
    setCurrentProjectId(projectId);
    router.push('/board');
  };

  const appendQuickLog = async (projectId: string) => {
    const text = (draftByProjectId[projectId] ?? '').trim();
    if (!text) return;

    const stats = projectStats.get(projectId);
    const pinnedTaskId = loggingTaskByProjectId[projectId] ?? null;
    const taskId = pinnedTaskId ?? stats?.hottestTaskId ?? null;
    const task = taskId ? tasks.find((t) => t.id === taskId) ?? null : null;
    if (!task) return;

    if (!canEditTask(task.createdBy, task.assigneeId)) return;
    if (pendingProjectId) return;

    setPendingProjectId(projectId);
    try {
      const entry: JournalLogEntry = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `jl-${Date.now()}`,
        text,
        createdAt: new Date().toISOString(),
      };
      const prev = task.journalLogs ?? [];
      const next = [...prev, entry];
      const ok = await updateTask(task.id, { journalLogs: next });
      if (ok) {
        setDraftByProjectId((d) => ({ ...d, [projectId]: '' }));
        setSavedProjectId(projectId);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedProjectId(null), 1500);
      }
    } finally {
      setPendingProjectId(null);
    }
  };

  const setPinnedLoggingTask = (projectId: string, taskIdOrAuto: string) => {
    setLoggingTaskByProjectId((prev) => {
      const next = { ...prev };
      if (taskIdOrAuto === '__auto__') delete next[projectId];
      else next[projectId] = taskIdOrAuto;
      try {
        localStorage.setItem(LOGGING_TASK_BY_PROJECT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  if (focusProjects.length === 0) return null;

  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Focus dashboard
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => router.push('/dashboard/processes')}
        >
          Süreçleri yönet
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      <div
        className={cn(
          'grid gap-3',
          'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
        )}
      >
        {focusProjects.map((p) => {
          const stats = projectStats.get(p.id) ?? { total: 0, done: 0, pct: 0, hottestTaskId: null, recentTaskIds: [] };
          const pinned = pinnedProjectIds.includes(p.id);
          const draft = draftByProjectId[p.id] ?? '';
          const pending = pendingProjectId === p.id;
          const pinnedTaskId = loggingTaskByProjectId[p.id] ?? null;
          const targetTaskId = pinnedTaskId ?? stats.hottestTaskId ?? null;
          const targetTask = targetTaskId ? tasks.find((t) => t.id === targetTaskId) ?? null : null;
          const hasTarget = Boolean(targetTask);
          const saved = savedProjectId === p.id;

          return (
            <Card key={p.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold truncate">{p.name}</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => togglePinProject(p.id)}
                    aria-label={pinned ? 'Unpin project' : 'Pin project'}
                    title={pinned ? 'Unpin' : 'Pin'}
                  >
                    <Star className={cn('h-4 w-4', pinned && 'fill-current')} />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {stats.done}/{stats.total} bitti
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {p.columnConfig?.length ? `${p.columnConfig.length} aşama` : 'Varsayılan'}
                  </Badge>
                </div>
                <Progress value={stats.pct} className="h-2" />
              </CardHeader>

              <CardContent className="pt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground truncate">
                    {hasTarget ? (
                      <>
                        Hedef:{' '}
                        <span className="text-foreground font-medium">
                          {targetTask?.title}
                        </span>
                      </>
                    ) : (
                      'Hedef: —'
                    )}
                  </p>
                  {saved && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0">
                      <Check className="h-3.5 w-3.5" />
                      Kaydedildi
                    </span>
                  )}
                </div>

                {stats.recentTaskIds.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Varsayılan günlük aksiyon</p>
                    <Popover
                      open={loggingTaskPickerProjectId === p.id}
                      onOpenChange={(open) => {
                        if (open) setLoggingTaskPickerProjectId(p.id);
                        else setLoggingTaskPickerProjectId((cur) => (cur === p.id ? null : cur));
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          disabled={pending}
                          className="h-9 w-full justify-between"
                          aria-label="Varsayılan günlük aksiyon seç"
                        >
                          <span className="truncate">
                            {pinnedTaskId
                              ? tasks.find((x) => x.id === pinnedTaskId)?.title ?? 'Seçili task'
                              : 'Otomatik (en son güncellenen)'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Aksiyon ara…" />
                          <CommandList>
                            <CommandEmpty>Sonuç yok.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__auto__"
                                onSelect={() => {
                                  setPinnedLoggingTask(p.id, '__auto__');
                                  setLoggingTaskPickerProjectId(null);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    !pinnedTaskId ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                Otomatik (en son güncellenen)
                              </CommandItem>
                              {stats.recentTaskIds.map((tid) => {
                                const t = tasks.find((x) => x.id === tid);
                                if (!t) return null;
                                const selected = pinnedTaskId === tid;
                                return (
                                  <CommandItem
                                    key={tid}
                                    value={t.title}
                                    onSelect={() => {
                                      setPinnedLoggingTask(p.id, tid);
                                      setLoggingTaskPickerProjectId(null);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        selected ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    <span className="truncate">{t.title}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={draft}
                    onChange={(e) =>
                      setDraftByProjectId((d) => ({ ...d, [p.id]: e.target.value }))
                    }
                    placeholder={hasTarget ? 'Hızlı not… (Enter)' : 'Bu süreçte aksiyon yok'}
                    disabled={!hasTarget || pending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void appendQuickLog(p.id);
                      }
                    }}
                    aria-label="Hızlı süreç notu"
                  />
                  <Button
                    type="button"
                    className="shrink-0 gap-2"
                    onClick={() => void appendQuickLog(p.id)}
                    disabled={!hasTarget || pending || !draft.trim()}
                  >
                    <PenLine className="h-4 w-4" />
                    {pending ? '…' : 'Ekle'}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openProjectBoard(p.id)}>
                    Sürece git
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                  {!hasTarget && (
                    <span className="text-xs text-muted-foreground">
                      Not için önce bir aksiyon oluştur
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

