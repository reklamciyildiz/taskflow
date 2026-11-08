'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, CalendarDays, CheckCircle2, FolderKanban, Plus, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { useTaskContext } from '@/components/TaskContext';
import { resolveStageLifecycle } from '@/lib/stage-lifecycle';
import { DashboardCapture } from '@/components/dashboard/DashboardCapture';
import { DashboardMyDay } from '@/components/dashboard/DashboardMyDay';
import {
  DashboardFocusProcesses,
  DashboardRecentKnowledge,
  DashboardWorkspaceSummary,
} from '@/components/dashboard/DashboardPanels';

function headingDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

export function DashboardV2() {
  const { currentTeam, projects, tasks, generalBoardColumns, loading } = useTaskContext();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [createActionOpen, setCreateActionOpen] = useState(false);
  const [dateLabel, setDateLabel] = useState('Today');

  useEffect(() => setDateLabel(headingDate()), []);

  // Values are derived from the current team's canonical task/stage lifecycle.
  // Never display invented trends or treat a custom stage name as "completed".
  const overview = useMemo(() => {
    const scopedProjects = currentTeam
      ? projects.filter(project => !project.teamId || project.teamId === currentTeam.id)
      : projects;
    const byProjectId = new Map(scopedProjects.map(project => [project.id, project]));
    const scopedTasks = currentTeam ? tasks.filter(task => task.teamId === currentTeam.id) : tasks;
    const lifecycle = scopedTasks.map(task => {
      const stages = task.projectId
        ? byProjectId.get(task.projectId)?.columnConfig ?? generalBoardColumns
        : generalBoardColumns;
      return resolveStageLifecycle(task.status, stages);
    });
    const completed = lifecycle.filter(stage => stage.isTerminal).length;
    const active = lifecycle.filter(stage => stage.isActionable).length;
    const total = scopedTasks.length;
    return {
      active,
      processes: scopedProjects.length,
      complete: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [currentTeam, projects, tasks, generalBoardColumns]);

  return (
    <div className="dashboard-v2 dashboard-v2-premium relative mx-auto w-full max-w-[1600px] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="dashboard-v2-hero">
        <div className="dashboard-v2-hero-content">
          <div className="dashboard-v2-hero-copy">
            <div className="dashboard-v2-eyebrow">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{dateLabel}</span>
              {currentTeam ? <><span aria-hidden="true" className="opacity-45">·</span><span className="truncate">{currentTeam.name}</span></> : null}
            </div>
            <h1 className="dashboard-v2-hero-title">Dashboard</h1>
            <p className="dashboard-v2-hero-description">
              Plan today, keep focus, and return to the work that matters.
            </p>
            <div className="dashboard-v2-hero-actions">
              <Button variant="outline" className="dashboard-v2-action-secondary" onClick={() => setCaptureOpen(true)}>
                <WandSparkles className="h-4 w-4" aria-hidden="true" />
                Capture
                <ArrowUpRight className="ml-1 h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </Button>
              <Button className="dashboard-v2-action-primary" onClick={() => setCreateActionOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />Add Action
              </Button>
            </div>
          </div>
          <div className="dashboard-v2-hero-stats" aria-label="Current workspace overview">
            <div className="dashboard-v2-hero-stat dashboard-v2-hero-stat--lime">
              <span className="dashboard-v2-hero-stat-icon"><Activity className="h-[19px] w-[19px]" aria-hidden="true" /></span>
              <span className="dashboard-v2-hero-stat-copy"><strong>{loading ? '—' : overview.active}</strong><span>Active Actions</span></span>
            </div>
            <div className="dashboard-v2-hero-stat dashboard-v2-hero-stat--blue">
              <span className="dashboard-v2-hero-stat-icon"><FolderKanban className="h-[19px] w-[19px]" aria-hidden="true" /></span>
              <span className="dashboard-v2-hero-stat-copy"><strong>{loading ? '—' : overview.processes}</strong><span>Processes</span></span>
            </div>
            <div className="dashboard-v2-hero-stat dashboard-v2-hero-stat--teal">
              <span className="dashboard-v2-hero-stat-icon"><CheckCircle2 className="h-[19px] w-[19px]" aria-hidden="true" /></span>
              <span className="dashboard-v2-hero-stat-copy"><strong>{loading ? '—' : `${overview.complete}%`}</strong><span>Complete</span></span>
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-v2-grid grid items-start gap-4 lg:gap-5 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8"><DashboardMyDay /></div>
        <div className="min-w-0 xl:col-span-4"><DashboardFocusProcesses /></div>
        <div className="min-w-0 xl:col-span-8"><DashboardRecentKnowledge /></div>
        <div className="min-w-0 xl:col-span-4"><DashboardWorkspaceSummary /></div>
      </div>

      <DashboardCapture open={captureOpen} onOpenChange={setCaptureOpen} />
      <CreateTaskModal open={createActionOpen} onClose={() => setCreateActionOpen(false)} />
    </div>
  );
}
