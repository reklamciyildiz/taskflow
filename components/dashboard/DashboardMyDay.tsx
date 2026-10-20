'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  FolderKanban,
  RefreshCw,
  Repeat2,
  SunMedium,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskContext } from '@/components/TaskContext';
import { plannerApi } from '@/lib/api';
import { formatDueDateYmdLocal } from '@/lib/due-date';
import { addCalendarDays } from '@/lib/scheduling-domain';
import {
  OCCURRENCE_CHANGED_EVENT,
  SCHEDULE_CHANGED_EVENT,
} from '@/lib/schedule-events';
import type {
  PlannerProjectionItem,
  PlannerTodayProjection,
  PlannerUpcomingProjection,
} from '@/lib/planner-projection';
import { cn } from '@/lib/utils';

const TODAY_LIMIT = 4;
const UPCOMING_LIMIT = 2;

function itemTitle(item: PlannerProjectionItem): string {
  return item.source.sourceType === 'checklist_item'
    ? item.checklistItemText || 'Checklist item'
    : item.taskTitle;
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(year, month - 1, day, 12));
}

function MyDayRow({
  item,
  tone = 'default',
  date,
  onOpen,
}: {
  item: PlannerProjectionItem;
  tone?: 'default' | 'overdue' | 'completed' | 'upcoming';
  date?: string;
  onOpen: () => void;
}) {
  const time = item.scheduleTime?.slice(0, 5) ?? null;
  const title = itemTitle(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('dashboard-v2-row group min-h-[62px] gap-3 px-3 py-2.5', tone === 'overdue' && 'hover:bg-destructive/[0.045]')}
    >
      <span
        className={cn(
          'flex h-3 w-3 shrink-0 items-center justify-center rounded-full ring-4',
          tone === 'overdue' && 'bg-destructive/75 ring-destructive/10',
          tone === 'completed' && 'h-5 w-5 bg-emerald-500/15 text-emerald-600 ring-0 dark:text-emerald-400',
          tone === 'default' && 'bg-primary/65 ring-primary/10',
          tone === 'upcoming' && 'bg-muted-foreground/45 ring-muted/70',
        )}
        aria-hidden
      >
        {tone === 'completed' ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block line-clamp-2 text-[0.84rem] font-medium leading-5 tracking-[-0.006em] text-foreground sm:line-clamp-1 sm:text-sm',
            tone === 'completed' && 'text-muted-foreground line-through',
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[0.7rem] text-muted-foreground">
          {item.projectName ? (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <FolderKanban className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.projectName}</span>
            </span>
          ) : (
            <span>General</span>
          )}
          {item.isRecurring ? <Repeat2 className="h-3 w-3 shrink-0" aria-label="Recurring" /> : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[0.68rem] tabular-nums text-muted-foreground sm:flex-row sm:items-center sm:gap-1.5">
        {date ? <span>{dateLabel(date)}</span> : null}
        {time ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/35 px-1.5 py-0.5">
            <Clock3 className="h-3 w-3" /> {time}
          </span>
        ) : null}
        <ChevronRight className="ml-1 hidden h-4 w-4 opacity-35 transition-all group-hover:translate-x-0.5 group-hover:opacity-70 sm:block" />
      </span>
    </button>
  );
}

export function DashboardMyDay() {
  const { currentTeam, openTaskEditor } = useTaskContext();
  const [day, setDay] = useState<{ date: string; timeZone: string } | null>(null);
  const [today, setToday] = useState<PlannerTodayProjection | null>(null);
  const [upcoming, setUpcoming] = useState<PlannerUpcomingProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const now = new Date();
    setDay({
      date: formatDueDateYmdLocal(now),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
  }, []);

  const load = useCallback(async () => {
    if (!currentTeam || !day) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    const [todayResult, upcomingResult] = await Promise.all([
      plannerApi.getToday({ date: day.date, teamId: currentTeam.id, timeZone: day.timeZone }),
      plannerApi.getUpcoming({
        startDate: addCalendarDays(day.date, 1),
        teamId: currentTeam.id,
        horizonDays: '14',
      }),
    ]);
    if (requestId !== requestRef.current) return;
    if (todayResult.success && todayResult.data) setToday(todayResult.data);
    if (upcomingResult.success && upcomingResult.data) setUpcoming(upcomingResult.data);
    if (!todayResult.success) setError(todayResult.error || 'My Day could not be loaded.');
    setLoading(false);
  }, [currentTeam, day]);

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(SCHEDULE_CHANGED_EVENT, refresh);
    window.addEventListener(OCCURRENCE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(SCHEDULE_CHANGED_EVENT, refresh);
      window.removeEventListener(OCCURRENCE_CHANGED_EVENT, refresh);
    };
  }, [load]);

  const upcomingItems = useMemo(
    () => (upcoming?.groups ?? [])
      .flatMap((group) => group.items.map((item) => ({ item, date: group.date })))
      .filter(({ item }) => item.state !== 'completed')
      .slice(0, UPCOMING_LIMIT),
    [upcoming],
  );
  const actionable = [...(today?.overdue ?? []), ...(today?.today ?? [])];
  const visibleActionable = actionable.slice(0, TODAY_LIMIT);
  const hiddenCount = Math.max(0, actionable.length - visibleActionable.length);

  return (
    <section className="dashboard-v2-panel min-w-0" aria-labelledby="dashboard-my-day-title">
      <header className="dashboard-v2-panel-header">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="dashboard-v2-icon"><SunMedium className="h-4 w-4" /></span>
          <div className="min-w-0 pt-0.5">
            <h2 id="dashboard-my-day-title" className="dashboard-v2-section-title">My Day</h2>
            <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{day ? dateLabel(day.date) : 'Your scheduled work'}</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="dashboard-v2-link">
          <Link href="/planner">Open Planner <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </header>

      {loading ? (
        <div className="space-y-2 px-4 pb-4 sm:px-5">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex min-h-14 items-center gap-3 px-2.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
            </div>
          ))}
        </div>
      ) : error && !today ? (
        <div className="dashboard-v2-empty mx-4 mb-4 sm:mx-5">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">My Day is unavailable</p><p className="text-xs text-muted-foreground">{error}</p></div>
          <Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button>
        </div>
      ) : (
        <div className="px-2 pb-3 sm:px-3">
          {today?.overdue.length ? (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-3 pb-1.5"><p className="dashboard-v2-kicker text-destructive">Overdue · {today.overdue.length}</p><span className="h-px flex-1 bg-destructive/10" /></div>
              <div className="dashboard-v2-list">
                {visibleActionable.filter((item) => today.overdue.some((overdue) => overdue.id === item.id)).map((item) => (
                  <MyDayRow key={item.id} item={item} tone="overdue" onOpen={() => openTaskEditor(item.taskId)} />
                ))}
              </div>
            </div>
          ) : null}
          {visibleActionable.some((item) => today?.today.some((todayItem) => todayItem.id === item.id)) ? (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-3 pb-1.5"><p className="dashboard-v2-kicker">Today · {today?.today.length ?? 0}</p><span className="h-px flex-1 bg-border/35" /></div>
              <div className="dashboard-v2-list">
                {visibleActionable.filter((item) => today?.today.some((todayItem) => todayItem.id === item.id)).map((item) => (
                  <MyDayRow key={item.id} item={item} onOpen={() => openTaskEditor(item.taskId)} />
                ))}
              </div>
            </div>
          ) : null}

          {actionable.length === 0 ? (
            <div className="dashboard-v2-empty mx-2 mb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /></span>
              <div><p className="text-sm font-medium">Your day is clear</p><p className="text-xs text-muted-foreground">No overdue or scheduled work for today.</p></div>
            </div>
          ) : null}

          {hiddenCount > 0 ? (
            <Button asChild variant="ghost" size="sm" className="mb-2 ml-2 h-11 rounded-lg text-xs text-muted-foreground">
              <Link href="/planner">View {hiddenCount} more in Planner <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          ) : null}

          {upcomingItems.length ? (
            <div className="border-t border-border/35 pt-3">
              <div className="flex items-center gap-2 px-3 pb-1.5"><p className="dashboard-v2-kicker">Coming up</p><span className="h-px flex-1 bg-border/35" /></div>
              <div className="dashboard-v2-list">
                {upcomingItems.map(({ item, date }) => (
                  <MyDayRow key={item.id} item={item} date={date} tone="upcoming" onOpen={() => openTaskEditor(item.taskId)} />
                ))}
              </div>
            </div>
          ) : null}

          {today?.completedToday.length ? (
            <div className="mt-2 border-t border-border/35 pt-2">
              <p className="px-2.5 py-1 text-xs text-muted-foreground">
                {today.completedToday.length} completed today
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
