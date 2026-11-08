'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FolderKanban,
  Layers3,
  Library,
  Star,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskContext } from '@/components/TaskContext';
import { useKnowledgeRetrieval } from '@/hooks/useKnowledgeRetrieval';
import { formatKnowledgeEntryDate, type KnowledgeHubCard } from '@/lib/knowledge-retrieval';
import { resolveStageLifecycle } from '@/lib/stage-lifecycle';
import { AxiomProcessList } from '@/shared/product-ui/AxiomWorkspaceLists';

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

  const focusStats = useMemo(() => {
    let total = 0;
    let active = 0;
    let finished = 0;
    for (const project of projectsForTeam) {
      const summary = summaries.get(project.id);
      total += summary?.total ?? 0;
      active += summary?.active ?? 0;
      finished += tasks.filter((task) =>
        task.projectId === project.id &&
        resolveStageLifecycle(task.status, project.columnConfig).isTerminal,
      ).length;
    }
    return {
      total,
      active,
      finished,
      percent: total > 0 ? Math.round((finished / total) * 100) : 0,
    };
  }, [projectsForTeam, summaries, tasks]);

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
    <section className="dashboard-v2-panel dashboard-v2-panel--focus min-w-0" aria-labelledby="dashboard-focus-title">
      <header className="dashboard-v2-panel-header">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="dashboard-v2-icon dashboard-v2-icon--focus"><Star className="h-4 w-4" /></span>
          <div className="min-w-0 pt-0.5">
            <h2 id="dashboard-focus-title" className="dashboard-v2-section-title">Focus Processes</h2>
            <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Pinned first, then recently active</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="dashboard-v2-link">
          <Link href="/dashboard/processes">Manage <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </header>

      <div className="dashboard-v2-list mx-2 mb-3 sm:mx-3">
        {loading ? [0, 1, 2].map((row) => (
          <div key={row} className="flex min-h-[68px] items-center gap-3 px-2.5"><Skeleton className="h-9 w-9 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>
        )) : visible.length === 0 ? (
          <div className="dashboard-v2-empty mx-2 mb-2">
            <FolderKanban className="h-5 w-5 text-muted-foreground" />
            <div><p className="text-sm font-medium">No Processes yet</p><p className="text-xs text-muted-foreground">Create a Process to keep important work close.</p></div>
          </div>
        ) : (
          <AxiomProcessList
            items={visible.map((project) => {
              const summary = summaries.get(project.id);
              return {
                id: project.id,
                name: project.name,
                activeActionCount: summary?.active ?? 0,
                totalActionCount: summary?.total ?? 0,
                updatedLabel: summary?.latest
                  ? `Updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(summary.latest.updatedAt)}`
                  : undefined,
                pinned: pinnedIds.includes(project.id),
              };
            })}
            onOpen={openBoardForProject}
            onTogglePin={togglePin}
          />
        )}
      </div>
      {!loading && projectsForTeam.length > 0 ? (
        <div className="dashboard-v2-focus-insight" aria-label="Visible process completion">
          <div className="dashboard-v2-donut" style={{
            background: `conic-gradient(#a3ef75 ${focusStats.percent}%, rgba(123, 166, 190, .18) 0)`,
          }} role="img" aria-label={`${focusStats.percent}% of process Actions completed`}>
            <span>{focusStats.percent}%</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Process progress</p>
            <p className="mt-1 text-sm font-medium">{focusStats.finished} of {focusStats.total} Actions completed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{focusStats.active} active Actions · {projectsForTeam.length} Processes</p>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
        </div>
      ) : null}
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
    <section className="dashboard-v2-panel dashboard-v2-panel--knowledge min-w-0" aria-labelledby="dashboard-knowledge-title">
      <header className="dashboard-v2-panel-header">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="dashboard-v2-icon dashboard-v2-icon--knowledge"><Library className="h-4 w-4" /></span>
          <div className="min-w-0 pt-0.5">
            <h2 id="dashboard-knowledge-title" className="dashboard-v2-section-title">Recent Knowledge</h2>
            <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Recent Notes and Checklist context</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="dashboard-v2-link">
          <Link href="/dashboard/knowledge-hub">Knowledge Hub <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </header>

      <div className="dashboard-v2-list mx-2 mb-3 sm:mx-3">
        {loading || notesLoading ? [0, 1, 2].map((row) => (
          <div key={row} className="flex min-h-[70px] items-center gap-3 px-2.5"><Skeleton className="h-9 w-9 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
        )) : notesError && entries.length === 0 ? (
          <div className="dashboard-v2-empty mx-2 mb-2"><BookOpen className="h-5 w-5 text-muted-foreground" /><div className="flex-1"><p className="text-sm font-medium">Knowledge is unavailable</p><p className="text-xs text-muted-foreground">{notesError}</p></div><Button variant="ghost" size="sm" onClick={() => void retryNotes()}>Retry</Button></div>
        ) : entries.length === 0 ? (
          <div className="dashboard-v2-empty mx-2 mb-2"><BookOpen className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm font-medium">No knowledge yet</p><p className="text-xs text-muted-foreground">Notes and meaningful Checklist context will appear here.</p></div></div>
        ) : entries.map((entry) => (
          <button key={entry.id} type="button" onClick={() => openTaskEditor(entry.taskId)} className="dashboard-v2-row group min-h-[72px] gap-3 px-3 py-2.5">
            <span className="dashboard-v2-row-icon"><BookOpen className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block line-clamp-2 text-[0.84rem] font-medium leading-5 tracking-[-0.006em] sm:line-clamp-1 sm:text-sm">{knowledgePreview(entry)}</span>
              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.68rem] text-muted-foreground"><span className="max-w-full truncate">{entry.projectName || 'General'} · {entry.taskTitle}</span><span className="shrink-0">{formatKnowledgeEntryDate(entry.sortDate)}</span></span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/35 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
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
  const tracked = active.length + completed;
  const completionPercent = tracked > 0 ? Math.round((completed / tracked) * 100) : 0;

  return (
    <section className="dashboard-v2-panel dashboard-v2-panel--summary min-w-0" aria-labelledby="dashboard-summary-title">
      <header className="dashboard-v2-panel-header">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="dashboard-v2-icon dashboard-v2-icon--summary"><Layers3 className="h-4 w-4" /></span>
          <div className="min-w-0 pt-0.5">
            <h2 id="dashboard-summary-title" className="dashboard-v2-section-title">Workspace Summary</h2>
            <p className="mt-0.5 text-[0.7rem] text-muted-foreground">Canonical workspace totals</p>
          </div>
        </div>
      </header>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {loading ? (
          <div className="space-y-4"><Skeleton className="h-28 w-full rounded-xl" /><div className="grid grid-cols-2 gap-4"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-16 rounded-lg" /></div></div>
        ) : (
          <div>
            <div className="dashboard-v2-summary-feature">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Activity className="h-3.5 w-3.5 text-primary" />Active work</span>
                <span className="dashboard-v2-summary-live"><span className="h-1.5 w-1.5 rounded-full bg-current" /> Current</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <strong className="text-[2rem] font-semibold leading-none tabular-nums tracking-[-0.045em]">{active.length}</strong>
                <p className="pb-0.5 text-right text-[0.7rem] leading-4 text-muted-foreground">Across {projectsForTeam.length}<br />visible Processes</p>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-[0.72rem]">
                <span className="text-muted-foreground">Completion</span>
                <strong className="tabular-nums">{completionPercent}%</strong>
              </div>
              <div className="dashboard-v2-progress-track mt-2"
                role="progressbar" aria-label="Workspace completion"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent}>
                <span style={{ width: `${completionPercent}%` }} />
              </div>
            </div>
            <div className="dashboard-v2-summary-tiles">
              <div className="px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground"><UserRound className="h-3.5 w-3.5" />Assigned to you</span>
                <strong className="mt-1 block text-lg font-semibold tabular-nums tracking-tight">{assigned}</strong>
              </div>
              <div className="px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Terminal Actions</span>
                <strong className="mt-1 block text-lg font-semibold tabular-nums tracking-tight">{completed}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-border/35 px-4 py-3 sm:px-5">
        <p className="flex items-start gap-2 text-[0.68rem] leading-4 text-muted-foreground"><CircleDot className="mt-0.5 h-3 w-3 shrink-0" /><span>Completion follows each Process&apos;s canonical terminal Stage.</span></p>
      </div>
    </section>
  );
}
