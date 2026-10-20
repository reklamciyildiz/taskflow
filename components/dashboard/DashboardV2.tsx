'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Plus, WandSparkles } from 'lucide-react';
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
    <div className="dashboard-v2 mx-auto w-full max-w-[1440px] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <header className="mb-6 flex flex-col gap-5 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[0.72rem] font-medium tracking-[0.01em] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-primary/80" />
            <span>{dateLabel}</span>
            {currentTeam ? <><span aria-hidden>·</span><span className="truncate">{currentTeam.name}</span></> : null}
          </div>
          <h1 className="text-[1.65rem] font-semibold leading-[1.15] tracking-[-0.035em] sm:text-[1.85rem]">Dashboard</h1>
          <p className="mt-1.5 max-w-xl text-[0.82rem] leading-5 text-muted-foreground sm:text-sm">Plan today, keep focus, and return to the work that matters.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button variant="outline" className="min-h-11 gap-2 rounded-lg border-border/55 bg-card/35 px-4 shadow-none hover:border-border/80 hover:bg-muted/45" onClick={() => setCaptureOpen(true)}>
            <WandSparkles className="h-4 w-4 text-primary" />Capture
          </Button>
          <Button className="min-h-11 gap-2 rounded-lg px-4 shadow-[0_6px_18px_-10px_hsl(var(--primary)/0.9)]" onClick={() => setCreateActionOpen(true)}>
            <Plus className="h-4 w-4" />Add Action
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-12 xl:gap-6">
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
