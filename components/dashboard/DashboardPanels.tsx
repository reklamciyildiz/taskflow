'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FolderKanban,
  Layers3,
  Library,
  ListTodo,
  Star,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskContext } from '@/components/TaskContext';
import { useKnowledgeRetrieval } from '@/hooks/useKnowledgeRetrieval';
import { formatKnowledgeEntryDate, type KnowledgeHubCard } from '@/lib/knowledge-retrieval';
import { resolveStageLifecycle } from '@/lib/stage-lifecycle';
import { cn } from '@/lib/utils';

const PINNED_PROJECTS_KEY = 'taskflow:pinnedProjectIds';
const RECENT_PROJECTS_KEY = 'taskflow:recentProjectIds';

function safeStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function DashboardFocusProcesses() {
  const { projects, tasks, currentTeam, loading, openBoardForProject } = useTaskContext();
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setPinnedIds(safeStringArray(localStorage.getItem(PINNED_PROJECTS_KEY)));
    setRecentIds(safeStringArray(localStorage.getItem(RECENT_PROJECTS_KEY)));
  }, []);

  const projectsForTeam = useMemo(
    () => currentTeam ? projects.filter((project) => !project.teamId || project.teamId === currentTeam.id) : projects,
    [projects, currentTeam],
  );
  const summaries = useMemo(() => new Map(projectsForTeam.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const active = projectTasks.filter((task) => resolveStageLifecycle(task.status, project.columnConfig).isActionable);
    const latest = [...projectTasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;
    return [project.id, { total: projectTasks.length, active: active.length, latest }];
  })), [projectsForTeam, tasks]);

  const visible = useMemo(() => {
    const byId = new Map(projectsForTeam.map((project) => [project.id, project]));
    const ordered: string[] = [];
    const add = (id: string) => {
      if (byId.has(id) && !ordered.includes(id)) ordered.push(id);
    };
    pinnedIds.forEach(add);
    recentIds.forEach(add);
    [...projectsForTeam]
      .sort((left, right) => (summaries.get(right.id)?.active ?? 0) - (summaries.get(left.id)?.active ?? 0))
      .forEach((project) => add(project.id));
    return ordered.slice(0, 5).map((id) => byId.get(id)!);
  }, [pinnedIds, recentIds, projectsForTeam, summaries]);

  const togglePin = (projectId: string) => {
    setPinnedIds((current) => {
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [projectId, ...current];
      localStorage.setItem(PINNED_PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <section className="dashboard-v2-panel min-w-0" aria-labelledby="dashboard-focus-title">
      <header className="dashboard-v2-panel-header">
        <div>
          <div className="flex items-center gap-2">
            <span className="dashboard-v2-icon bg-amber-500/10 text-amber-600 dark:text-amber-400"><Star className="h-4 w-4" /></span>
            <h2 id="dashboard-focus-title" className="dashboard-v2-section-title">Focus Processes</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Pinned first, then recently active</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-9 px-2 text-xs">
          <Link href="/dashboard/processes">Manage <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </header>

      <div className="px-2 pb-3 sm:px-3">
        {loading ? [0, 1, 2].map((row) => (
          <div key={row} className="flex min-h-[68px] items-center gap-3 px-2.5"><Skeleton className="h-9 w-9 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>
        )) : visible.length === 0 ? (
          <div className="dashboard-v2-empty mx-2 mb-2">
            <FolderKanban className="h-5 w-5 text-muted-foreground" />
            <div><p className="text-sm font-medium">No Processes yet</p><p className="text-xs text-muted-foreground">Create a Process to keep important work close.</p></div>
          </div>
        ) : visible.map((project) => {
          const summary = summaries.get(project.id);
          const pinned = pinnedIds.includes(project.id);
          return (
            <div key={project.id} className="group flex min-h-[68px] items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/45">
              <button type="button" onClick={() => openBoardForProject(project.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 rounded-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground"><FolderKanban className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{project.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {summary?.active ?? 0} active · {summary?.total ?? 0} Actions
                    {summary?.latest ? ` · Updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(summary.latest.updatedAt)}` : ''}
                  </span>
                </span>
              </button>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => togglePin(project.id)} aria-label={pinned ? `Unpin ${project.name}` : `Pin ${project.name}`}>
                <Star className={cn('h-4 w-4 text-muted-foreground', pinned && 'fill-amber-400 text-amber-500')} />
              </Button>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 sm:block" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function knowledgePreview(card: KnowledgeHubCard): string {
  const note = card.notes[0];
  if (note) return note.title || note.text || card.taskTitle;
  return card.checklistItems[0]?.text || card.taskTitle;
}

export function DashboardRecentKnowledge() {
  const { tasks, projects, teams, currentTeam, loading, openTaskEditor } = useTaskContext();
  const { cards, notesLoading, notesError, retryNotes } = useKnowledgeRetrieval({
    tasks,
    projects,
    teams,
    teamId: currentTeam?.id ?? null,
    noteLimit: 12,
  });
  const entries = useMemo(
    () => cards.filter((card) => card.notes.length > 0 || card.checklistItems.length > 0).slice(0, 4),
    [cards],
  );

  return (
    <section className="dashboard-v2-panel min-w-0" aria-labelledby="dashboard-knowledge-title">
      <header className="dashboard-v2-panel-header">
        <div>
          <div className="flex items-center gap-2">
            <span className="dashboard-v2-icon bg-violet-500/10 text-violet-600 dark:text-violet-400"><Library className="h-4 w-4" /></span>
            <h2 id="dashboard-knowledge-title" className="dashboard-v2-section-title">Recent Knowledge</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Recent Notes and Checklist context</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-9 px-2 text-xs">
          <Link href="/dashboard/knowledge-hub">Knowledge Hub <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </header>

      <div className="px-2 pb-3 sm:px-3">
        {loading || notesLoading ? [0, 1, 2].map((row) => (
          <div key={row} className="flex min-h-[70px] items-center gap-3 px-2.5"><Skeleton className="h-9 w-9 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
        )) : notesError && entries.length === 0 ? (
          <div className="dashboard-v2-empty mx-2 mb-2"><BookOpen className="h-5 w-5 text-muted-foreground" /><div className="flex-1"><p className="text-sm font-medium">Knowledge is unavailable</p><p className="text-xs text-muted-foreground">{notesError}</p></div><Button variant="ghost" size="sm" onClick={() => void retryNotes()}>Retry</Button></div>
        ) : entries.length === 0 ? (
          <div className="dashboard-v2-empty mx-2 mb-2"><BookOpen className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm font-medium">No knowledge yet</p><p className="text-xs text-muted-foreground">Notes and meaningful Checklist context will appear here.</p></div></div>
        ) : entries.map((entry) => (
          <button key={entry.id} type="button" onClick={() => openTaskEditor(entry.taskId)} className="group flex min-h-[70px] w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground"><BookOpen className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{knowledgePreview(entry)}</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><span className="truncate">{entry.projectName || 'General'} · {entry.taskTitle}</span><span className="shrink-0">· {formatKnowledgeEntryDate(entry.sortDate)}</span></span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </section>
  );
}

function SummaryMetric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg px-2.5 py-2">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>{icon}</span>
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{label}</span>
      <strong className="text-lg font-semibold tabular-nums tracking-tight">{value}</strong>
    </div>
  );
}

export function DashboardWorkspaceSummary() {
  const { projects, tasks, currentTeam, currentUser, loading, generalBoardColumns } = useTaskContext();
  const projectsForTeam = useMemo(
    () => currentTeam ? projects.filter((project) => !project.teamId || project.teamId === currentTeam.id) : projects,
    [projects, currentTeam],
  );
  const scopedTasks = useMemo(
    () => currentTeam ? tasks.filter((task) => task.teamId === currentTeam.id) : tasks,
    [tasks, currentTeam],
  );
  const projectById = useMemo(() => new Map(projectsForTeam.map((project) => [project.id, project])), [projectsForTeam]);
  const lifecycleFor = (task: typeof scopedTasks[number]) => {
    const columns = task.projectId ? projectById.get(task.projectId)?.columnConfig ?? [] : generalBoardColumns;
    return resolveStageLifecycle(task.status, columns);
  };
  const active = scopedTasks.filter((task) => lifecycleFor(task).isActionable);
  const completed = scopedTasks.filter((task) => lifecycleFor(task).isTerminal).length;
  const assigned = currentUser ? active.filter((task) => task.assigneeId === currentUser.id).length : 0;

  return (
    <section className="dashboard-v2-panel min-w-0" aria-labelledby="dashboard-summary-title">
      <header className="dashboard-v2-panel-header">
        <div>
          <div className="flex items-center gap-2">
            <span className="dashboard-v2-icon bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"><Layers3 className="h-4 w-4" /></span>
            <h2 id="dashboard-summary-title" className="dashboard-v2-section-title">Workspace Summary</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Canonical workspace totals</p>
        </div>
      </header>
      <div className="grid grid-cols-1 px-2 pb-3 sm:grid-cols-2 sm:px-3 lg:grid-cols-1">
        {loading ? [0, 1, 2, 3].map((row) => <div key={row} className="flex min-h-14 items-center gap-3 px-2.5"><Skeleton className="h-9 w-9 rounded-lg" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-6 w-8" /></div>) : (
          <>
            <SummaryMetric icon={<FolderKanban className="h-4 w-4" />} label="Visible Processes" value={projectsForTeam.length} tone="bg-primary/10 text-primary" />
            <SummaryMetric icon={<ListTodo className="h-4 w-4" />} label="Active Actions" value={active.length} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
            <SummaryMetric icon={<UserRound className="h-4 w-4" />} label="Assigned to you" value={assigned} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
            <SummaryMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Terminal Actions" value={completed} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
          </>
        )}
      </div>
      <div className="border-t border-border/55 px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDot className="h-3.5 w-3.5" /><span>Completion uses each Process&apos;s canonical terminal Stage.</span></p>
      </div>
    </section>
  );
}
