'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Plus, Sparkles } from 'lucide-react';
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

function headingDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

export function DashboardV2() {
  const { currentTeam } = useTaskContext();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [createActionOpen, setCreateActionOpen] = useState(false);
  const [dateLabel, setDateLabel] = useState('Today');

  useEffect(() => setDateLabel(headingDate()), []);

  return (
    <div className="dashboard-v2 mx-auto w-full max-w-[1480px] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{dateLabel}</span>
            {currentTeam ? <><span aria-hidden>·</span><span className="truncate">{currentTeam.name}</span></> : null}
          </div>
          <h1 className="text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[1.7rem]">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plan today, keep focus, and return to the work that matters.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button variant="outline" className="min-h-11 gap-2 border-border/70 bg-background/70 px-4 shadow-none" onClick={() => setCaptureOpen(true)}>
            <Sparkles className="h-4 w-4 text-primary" />Capture
          </Button>
          <Button className="min-h-11 gap-2 px-4 shadow-none" onClick={() => setCreateActionOpen(true)}>
            <Plus className="h-4 w-4" />Add Action
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-12 xl:gap-5">
        <div className="min-w-0 lg:col-span-8"><DashboardMyDay /></div>
        <div className="min-w-0 lg:col-span-4"><DashboardFocusProcesses /></div>
        <div className="min-w-0 lg:col-span-8"><DashboardRecentKnowledge /></div>
        <div className="min-w-0 lg:col-span-4"><DashboardWorkspaceSummary /></div>
      </div>

      <DashboardCapture open={captureOpen} onOpenChange={setCaptureOpen} />
      <CreateTaskModal open={createActionOpen} onClose={() => setCreateActionOpen(false)} />
    </div>
  );
}
