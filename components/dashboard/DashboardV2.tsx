'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, CheckCircle2, FolderKanban, Plus, Sparkles, WandSparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { useTaskContext } from '@/components/TaskContext';
import { DashboardCapture } from '@/components/dashboard/DashboardCapture';
import { DashboardMyDay } from '@/components/dashboard/DashboardMyDay';
import {
  DashboardFocusProcesses,
  DashboardRecentKnowledge,
  DashboardWorkspaceSummary,
} from '@/components/dashboard/DashboardPanels';
import { resolveStageLifecycle } from '@/lib/stage-lifecycle';

function headingDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

/** Live workspace values only: no fabricated growth, trends or sample KPIs. */
export function DashboardV2() {
  const { currentTeam, projects, tasks, generalBoardColumns, loading } = useTaskContext();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [createActionOpen, setCreateActionOpen] = useState(false);
  const [dateLabel, setDateLabel] = useState('Today');

  useEffect(() => setDateLabel(headingDate()), []);

  const overview = useMemo(() => {
    const teamProjects = currentTeam
      ? projects.filter((project) => !project.teamId || project.teamId === currentTeam.id)
      : projects;
    const scopedTasks = currentTeam
      ? tasks.filter((task) => task.teamId === currentTeam.id)
      : tasks;
    const byProject = new Map(teamProjects.map((project) => [project.id, project]));
    let active = 0;
    let completed = 0;
    for (const task of scopedTasks) {
      const columns = task.projectId
        ? byProject.get(task.projectId)?.columnConfig ?? []
        : generalBoardColumns;
      const lifecycle = resolveStageLifecycle(task.status, columns);
      if (lifecycle.isTerminal) completed += 1;
      else if (lifecycle.isActionable) active += 1;
    }
    const total = scopedTasks.length;
    return {
      active,
      processes: teamProjects.length,
      completion: total > 0 ? Math.round((completed / total) * 100) : 0,
      total,
    };
  }, [currentTeam, projects, tasks, generalBoardColumns]);

  return (
    <main className="dashboard-v2 mx-auto w-full max-w-[1540px] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <header className="dashboard-v2-hero mb-5 sm:mb-6" aria-label="Dashboard overview">
        <span className="dashboard-v2-hero-orbit" aria-hidden="true" />
        <div className="dashboard-v2-hero-content">
          <div className="min-w-0">
            <div className="dashboard-v2-eyebrow">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>{dateLabel}</span>
              {currentTeam ? <><span aria-hidden="true">·</span><span className="truncate">{currentTeam.name}</span></> : null}
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <h1 className="text-[1.8rem] font-bold leading-[1.1] tracking-[-0.045em] sm:text-[2.1rem]">Dashboard</h1>
              <span className="dashboard-v2-live-label hidden sm:inline-flex"><Sparkles className="h-3 w-3" /> Your workspace</span>
            </div>
            <p className="mt-2 max-w-xl text-[0.82rem] leading-5 text-muted-foreground sm:text-sm">
              Plan today, keep focus, and return to the work that matters.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" className="dashboard-v2-capture min-h-11 gap-2 px-4" onClick={() => setCaptureOpen(true)}>
              <WandSparkles className="h-4 w-4" /> Capture
            </Button>
            <Button className="dashboard-v2-add min-h-11 gap-2 px-4" onClick={() => setCreateActionOpen(true)}>
              <Plus className="h-4 w-4" /> Add Action
              <ArrowUpRight className="hidden h-3.5 w-3.5 opacity-60 sm:block" />
            </Button>
          </div>
        </div>

        <div className="dashboard-v2-overview" aria-label="Current team metrics">
          <div className="dashboard-v2-metric dashboard-v2-metric--lime">
            <span className="dashboard-v2-metric-icon"><Zap className="h-4 w-4" /></span>
            <span className="min-w-0"><strong>{loading ? '—' : overview.active}</strong><span>Active Actions</span></span>
          </div>
          <div className="dashboard-v2-metric dashboard-v2-metric--blue">
            <span className="dashboard-v2-metric-icon"><FolderKanban className="h-4 w-4" /></span>
            <span className="min-w-0"><strong>{loading ? '—' : overview.processes}</strong><span>Processes</span></span>
          </div>
          <div className="dashboard-v2-metric dashboard-v2-metric--teal">
            <span className="dashboard-v2-metric-icon"><CheckCircle2 className="h-4 w-4" /></span>
            <span className="min-w-0"><strong>{loading ? '—' : `${overview.completion}%`}</strong><span>Completed Actions</span></span>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-12 xl:gap-5">
        <div className="min-w-0 xl:col-span-8"><DashboardMyDay /></div>
        <div className="min-w-0 xl:col-span-4"><DashboardFocusProcesses /></div>
        <div className="min-w-0 xl:col-span-8"><DashboardRecentKnowledge /></div>
        <div className="min-w-0 xl:col-span-4"><DashboardWorkspaceSummary /></div>
      </div>

      <DashboardCapture open={captureOpen} onOpenChange={setCaptureOpen} />
      <CreateTaskModal open={createActionOpen} onClose={() => setCreateActionOpen(false)} />
    </main>
  );
}
