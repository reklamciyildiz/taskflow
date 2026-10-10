'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderKanban,
  MoreHorizontal,
  Repeat2,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTaskContext } from '@/components/TaskContext';
import { plannerApi, scheduleApi } from '@/lib/api';
import { formatDueDateYmdLocal } from '@/lib/due-date';
import {
  buildPlannerTodayProjection,
  type PlannerProjectionItem,
  type PlannerTodayProjection,
  type PlannerUpcomingProjection,
} from '@/lib/planner-projection';
import { setChecklistItemCheckedInDocument } from '@/components/editor/reorderChecklistItem';
import {
  FALLBACK_BOARD_COLUMNS,
  isTerminalBoardColumn,
  type ProjectColumnConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { addCalendarDays } from '@/lib/scheduling-domain';
import {
  dispatchOccurrenceChanged,
  dispatchScheduleChanged,
  OCCURRENCE_CHANGED_EVENT,
  SCHEDULE_CHANGED_EVENT,
} from '@/lib/schedule-events';

const plannerCache = new Map<string, PlannerTodayProjection>();
const upcomingCache = new Map<string, PlannerUpcomingProjection>();

function withProjectionItem(
  projection: PlannerTodayProjection,
  item: PlannerProjectionItem,
  timeZone: string,
): PlannerTodayProjection {
  const all = [...projection.overdue, ...projection.today, ...projection.completedToday]
    .filter((entry) => entry.id !== item.id);
  all.push(item);
  return buildPlannerTodayProjection(all, projection.date, timeZone);
}

function todayHeading(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(year, month - 1, day, 12));
}

function compactTime(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

function compactDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(new Date(year, month - 1, day, 12));
}

function upcomingHeading(value: string, today: string): string {
  if (value === addCalendarDays(today, 1)) return 'Tomorrow';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(year, month - 1, day, 12));
}

function PlannerSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl animate-pulse space-y-8" aria-label="Loading Planner">
      <div className="space-y-3">
        <div className="h-8 w-64 rounded-md bg-muted/70" />
        <div className="h-4 w-40 rounded bg-muted/50" />
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="space-y-2">
          <div className="h-3 w-24 rounded bg-muted/50" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3">
              <div className="h-4 w-4 rounded bg-muted/70" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-muted/70" />
                <div className="h-3 w-1/3 rounded bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function columnsForItem(
  item: PlannerProjectionItem,
  projects: ReturnType<typeof useTaskContext>['projects'],
): ProjectColumnConfig[] {
  const configured = projects.find((project) => project.id === item.projectId)?.columnConfig;
  return configured?.length ? configured : FALLBACK_BOARD_COLUMNS;
}

function PlannerRow({
  item,
  completed,
  pending,
  onToggle,
  onOpen,
  assigneeName,
  showDate,
  onReschedule,
  onSkip,
}: {
  item: PlannerProjectionItem;
  completed: boolean;
  pending: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  assigneeName: string | null;
  showDate: boolean;
  onReschedule: (date: string) => void;
  onSkip: () => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const title = item.source.sourceType === 'checklist_item'
    ? item.checklistItemText || 'Checklist item'
    : item.taskTitle;
  const time = compactTime(item.scheduleTime);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'group flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border/55 bg-card/35 px-3 py-3 transition-colors hover:border-border hover:bg-muted/25 sm:px-4',
        pending && 'pointer-events-none opacity-65',
      )}
    >
      <Checkbox
        checked={completed}
        disabled={pending}
        aria-label={completed ? `Mark ${title} incomplete` : `Complete ${title}`}
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={(value) => onToggle(value === true)}
        className="mt-0.5 h-[18px] w-[18px] rounded-[5px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className={cn('min-w-0 text-sm font-medium leading-5', completed && 'text-muted-foreground line-through')}>
            {title}
          </p>
          {time ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground"
              title={item.timeZone ? `${time} · ${item.timeZone}` : time}
            >
              <Clock3 className="h-3.5 w-3.5" aria-hidden />
              {time}
            </span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-mr-2 h-7 w-7 shrink-0 text-muted-foreground opacity-70 sm:opacity-0 sm:group-hover:opacity-100 sm:data-[state=open]:opacity-100"
                aria-label={`Schedule options for ${title}`}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onSelect={() => onReschedule(addCalendarDays(formatDueDateYmdLocal(new Date()), 1))}>
                Tomorrow
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDateOpen(true)}>Pick another date</DropdownMenuItem>
              {item.isRecurring ? <DropdownMenuItem onSelect={onSkip}>Skip this occurrence</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showDate ? (
            <span className="inline-flex items-center gap-1 text-destructive/90">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {compactDate(item.effectiveDate)}
            </span>
          ) : null}
          {showDate ? <span aria-hidden>·</span> : null}
          {item.source.sourceType === 'checklist_item' ? (
            <span className="max-w-[22rem] truncate">{item.taskTitle}</span>
          ) : (
            <span>Action</span>
          )}
          {item.projectName ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <FolderKanban className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{item.projectName}</span>
              </span>
            </>
          ) : null}
          {assigneeName ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <UserRound className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{assigneeName}</span>
              </span>
            </>
          ) : null}
          {item.isRecurring ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Recurring</span> : null}
          {item.missedCount > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {item.missedCount} previous {item.missedCount === 1 ? 'occurrence' : 'occurrences'} missed
            </span>
          ) : null}
        </div>
      </div>
      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent
          className="w-auto max-w-[calc(100vw-2rem)] p-3"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Reschedule work</DialogTitle>
            <DialogDescription>Choose the date this work should appear in Planner.</DialogDescription>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={undefined}
            onSelect={(selected) => {
              if (!selected) return;
              onReschedule(formatDueDateYmdLocal(selected));
              setDateOpen(false);
            }}
            initialFocus
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PlannerToday() {
  const {
    tasks,
    projects,
    currentTeam,
    loading,
    updateTask,
    openTaskEditor,
    canCompleteTask,
    canEditTask,
  } = useTaskContext();
  const [view, setView] = useState<'today' | 'upcoming'>('today');
  const [localDay, setLocalDay] = useState<{ date: string; timeZone: string } | null>(null);
  useEffect(() => {
    let timer: number | null = null;
    const update = () => {
      const now = new Date();
      setLocalDay({
        date: formatDueDateYmdLocal(now),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 25);
      timer = window.setTimeout(update, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    };
    update();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);
  const date = localDay?.date ?? '';
  const timeZone = localDay?.timeZone ?? 'UTC';
  const cacheKey = currentTeam && localDay ? `${currentTeam.id}:${date}:${timeZone}` : '';
  const upcomingKey = currentTeam && localDay ? `${currentTeam.id}:${addCalendarDays(date, 1)}:14` : '';
  const [projection, setProjection] = useState<PlannerTodayProjection | null>(
    () => (cacheKey ? plannerCache.get(cacheKey) ?? null : null),
  );
  const [projectionScopeKey, setProjectionScopeKey] = useState(cacheKey);
  const visibleProjection = projectionScopeKey === cacheKey ? projection : null;
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<PlannerUpcomingProjection | null>(
    () => (upcomingKey ? upcomingCache.get(upcomingKey) ?? null : null),
  );
  const [upcomingScopeKey, setUpcomingScopeKey] = useState(upcomingKey);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const visibleUpcoming = upcomingScopeKey === upcomingKey ? upcoming : null;
  const [completedOpen, setCompletedOpen] = useState(true);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const pendingTaskIdsRef = useRef<Set<string>>(new Set());
  const requestRef = useRef(0);
  const upcomingRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const mutationCountRef = useRef(0);
  const activeCacheKeyRef = useRef(cacheKey);
  activeCacheKeyRef.current = cacheKey;
  const activeUpcomingKeyRef = useRef(upcomingKey);
  activeUpcomingKeyRef.current = upcomingKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      upcomingRequestRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    if (!currentTeam || !localDay || loading) return;
    const requestId = ++requestRef.current;
    setError(null);
    const response = await plannerApi.getToday({ date, teamId: currentTeam.id, timeZone });
    if (!mountedRef.current || requestId !== requestRef.current) return;
    if (activeCacheKeyRef.current !== cacheKey) return;
    if (!response.success || !response.data) {
      setError(response.error || 'Could not load today');
      return;
    }
    plannerCache.set(cacheKey, response.data);
    setProjection(response.data);
    setProjectionScopeKey(cacheKey);
  }, [cacheKey, currentTeam, date, loading, localDay, timeZone]);

  const loadUpcoming = useCallback(async () => {
    if (!currentTeam || !localDay || loading) return;
    const requestId = ++upcomingRequestRef.current;
    setUpcomingError(null);
    const response = await plannerApi.getUpcoming({
      startDate: addCalendarDays(date, 1),
      teamId: currentTeam.id,
      horizonDays: '14',
    });
    if (
      !mountedRef.current
      || requestId !== upcomingRequestRef.current
      || activeUpcomingKeyRef.current !== upcomingKey
    ) return;
    if (!response.success || !response.data) {
      setUpcomingError(response.error || 'Could not load upcoming work');
      return;
    }
    upcomingCache.set(upcomingKey, response.data);
    setUpcoming(response.data);
    setUpcomingScopeKey(upcomingKey);
  }, [currentTeam, date, loading, localDay, upcomingKey]);

  useEffect(() => {
    if (!cacheKey) return;
    const cached = plannerCache.get(cacheKey) ?? null;
    setProjection(cached);
    setProjectionScopeKey(cacheKey);
    void load();
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!upcomingKey || view !== 'upcoming') return;
    setUpcoming(upcomingCache.get(upcomingKey) ?? null);
    setUpcomingScopeKey(upcomingKey);
    void loadUpcoming();
  }, [upcomingKey, view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => {
      void load();
      if (view === 'upcoming' || upcomingCache.has(upcomingKey)) void loadUpcoming();
    };
    window.addEventListener(SCHEDULE_CHANGED_EVENT, refresh);
    window.addEventListener(OCCURRENCE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(SCHEDULE_CHANGED_EVENT, refresh);
      window.removeEventListener(OCCURRENCE_CHANGED_EVENT, refresh);
    };
  }, [load, loadUpcoming, upcomingKey, view]);

  const taskRevision = useMemo(
    () => new Map(tasks
      .filter((task) => task.teamId === currentTeam?.id)
      .map((task) => [task.id, task.updatedAt.getTime()] as const)),
    [currentTeam?.id, tasks],
  );
  const taskRevisionRef = useRef(taskRevision);
  useEffect(() => {
    const previous = taskRevisionRef.current;
    taskRevisionRef.current = taskRevision;
    if (!visibleProjection) return;
    const changedTaskIds = [...taskRevision.entries()]
      .filter(([taskId, revision]) => previous.get(taskId) !== revision)
      .map(([taskId]) => taskId);
    if (!changedTaskIds.length) return;
    const timer = window.setTimeout(() => {
      if (mutationCountRef.current === 0) void load();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [load, taskRevision, visibleProjection]);

  const replaceProjectionItem = useCallback((item: PlannerProjectionItem) => {
    const cached = plannerCache.get(cacheKey);
    if (cached) plannerCache.set(cacheKey, withProjectionItem(cached, item, timeZone));
    if (activeCacheKeyRef.current !== cacheKey) return;
    setProjection((current) => {
      if (!current || projectionScopeKey !== cacheKey) return current;
      const next = withProjectionItem(current, item, timeZone);
      if (cacheKey) plannerCache.set(cacheKey, next);
      return next;
    });
  }, [cacheKey, projectionScopeKey, timeZone]);

  const replaceUpcomingItem = useCallback((item: PlannerProjectionItem) => {
    setUpcoming((current) => {
      if (!current || upcomingScopeKey !== upcomingKey) return current;
      const next = {
        ...current,
        groups: current.groups.map((group) => ({
          ...group,
          items: group.items.map((entry) => entry.id === item.id ? item : entry),
        })),
      };
      upcomingCache.set(upcomingKey, next);
      return next;
    });
  }, [upcomingKey, upcomingScopeKey]);

  const replaceVisibleItem = useCallback((item: PlannerProjectionItem) => {
    if (view === 'upcoming') replaceUpcomingItem(item);
    else replaceProjectionItem(item);
  }, [replaceProjectionItem, replaceUpcomingItem, view]);

  const setOptimisticState = useCallback((item: PlannerProjectionItem, completed: boolean) => {
    replaceVisibleItem({
      ...item,
      state: completed ? 'completed' : 'pending',
      completedAt: completed ? new Date().toISOString() : null,
    });
  }, [replaceVisibleItem]);

  const toggle = useCallback(async (item: PlannerProjectionItem, completed: boolean) => {
    if (pendingTaskIdsRef.current.has(item.taskId)) return;
    const task = tasks.find((candidate) => candidate.id === item.taskId);
    if (!task) {
      toast.error('The source Action is no longer available.');
      void load();
      return;
    }
    if (
      item.source.sourceType === 'action'
        ? !canCompleteTask(task.assigneeId)
        : !canEditTask(task.createdBy, task.assigneeId)
    ) {
      toast.error('You do not have permission to update this item.');
      return;
    }

    pendingTaskIdsRef.current.add(item.taskId);
    mutationCountRef.current += 1;
    setPendingTaskIds((current) => new Set(current).add(item.taskId));
    setOptimisticState(item, completed);
    let ok = false;
    try {
      if (item.isRecurring) {
        const response = await plannerApi.setOccurrenceCompleted({
          scheduleId: item.scheduleId,
          occurrenceDate: item.occurrenceDate,
          completed,
        });
        ok = response.success;
      } else if (item.source.sourceType === 'action') {
        const columns = columnsForItem(item, projects);
        const terminal = columns.find((column) => isTerminalBoardColumn(column.id, columns));
        const open = columns.find((column) => column.id === 'todo')
          ?? columns.find((column) => !isTerminalBoardColumn(column.id, columns));
        if (!terminal || !open) throw new Error('This process needs active and completed columns');
        ok = await updateTask(task.id, { status: completed ? terminal.id : open.id });
      } else {
        const checklistBlocks = setChecklistItemCheckedInDocument(
          task.checklistBlocks,
          item.source.checklistItemId,
          completed,
        );
        if (!checklistBlocks) throw new Error('Checklist item not found');
        ok = await updateTask(task.id, { checklistBlocks });
      }
    } catch (cause) {
      console.error('Planner completion failed:', cause);
      ok = false;
    } finally {
      mutationCountRef.current -= 1;
      pendingTaskIdsRef.current.delete(item.taskId);
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(item.taskId);
        return next;
      });
    }

    if (!ok) {
      replaceVisibleItem(item);
      toast.error('Could not update this item. Your change was restored.');
      return;
    }
    if (item.isRecurring) dispatchOccurrenceChanged(item.scheduleId, item.occurrenceDate);
  }, [
    canCompleteTask,
    canEditTask,
    load,
    projects,
    replaceVisibleItem,
    setOptimisticState,
    tasks,
    updateTask,
  ]);

  const reschedule = useCallback(async (item: PlannerProjectionItem, nextDate: string) => {
    let success = false;
    if (item.isRecurring) {
      const response = await plannerApi.mutateOccurrence({
        scheduleId: item.scheduleId,
        occurrenceDate: item.occurrenceDate,
        action: 'reschedule',
        effectiveDate: nextDate,
      });
      success = response.success;
      if (success) dispatchOccurrenceChanged(item.scheduleId, item.occurrenceDate);
    } else {
      const response = await scheduleApi.save({
        source: item.source,
        scheduleType: 'one_off',
        scheduleDate: nextDate,
        scheduleTime: item.scheduleTime,
        timeZone: item.timeZone,
        reminderRules: item.reminderRules,
      });
      success = response.success;
      if (success && response.data) dispatchScheduleChanged(item.source, response.data);
    }
    if (!success) {
      toast.error('Could not reschedule this item');
      return;
    }
    toast.success(`Rescheduled to ${compactDate(nextDate)}`);
  }, []);

  const skip = useCallback(async (item: PlannerProjectionItem) => {
    if (!item.isRecurring) return;
    const response = await plannerApi.mutateOccurrence({
      scheduleId: item.scheduleId,
      occurrenceDate: item.occurrenceDate,
      action: 'skip',
    });
    if (!response.success) {
      toast.error(response.error || 'Could not skip this occurrence');
      return;
    }
    dispatchOccurrenceChanged(item.scheduleId, item.occurrenceDate);
    toast.success('Occurrence skipped');
  }, []);

  if (view === 'today' && !visibleProjection && error) {
    return (
      <div className="mx-auto flex min-h-[45vh] w-full max-w-4xl items-center justify-center">
        <div className="rounded-xl border border-destructive/25 bg-card/30 px-6 py-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-destructive" aria-hidden />
          <p className="text-sm font-medium">Today could not be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">Your source Actions and Checklist items were not changed.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (view === 'upcoming' && !visibleUpcoming && upcomingError) {
    return (
      <div className="mx-auto flex min-h-[45vh] w-full max-w-4xl items-center justify-center">
        <div className="rounded-xl border border-destructive/25 bg-card/30 px-6 py-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-destructive" aria-hidden />
          <p className="text-sm font-medium">Upcoming work could not be loaded</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void loadUpcoming()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (view === 'today' && !visibleProjection) return <PlannerSkeleton />;
  if (view === 'upcoming' && !visibleUpcoming) return <PlannerSkeleton />;

  const groups = visibleProjection ?? { date, overdue: [], today: [], completedToday: [] };
  const remaining = groups.overdue.length + groups.today.length;
  const members = new Map((currentTeam?.members ?? []).map((member) => [member.id, member.name]));
  const renderRows = (
    items: PlannerProjectionItem[],
    completed = false,
    showDate = false,
  ) => (
    <div className="space-y-1.5">
      {items.map((item) => (
        <PlannerRow
          key={item.id}
          item={item}
          completed={completed || item.state === 'completed'}
          pending={pendingTaskIds.has(item.taskId)}
          assigneeName={item.assigneeId ? members.get(item.assigneeId) ?? 'Assigned' : null}
          showDate={showDate}
          onToggle={(checked) => void toggle(item, checked)}
          onOpen={() => openTaskEditor(item.taskId, item.checklistItemId)}
          onReschedule={(nextDate) => void reschedule(item, nextDate)}
          onSkip={() => void skip(item)}
        />
      ))}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-4xl pb-16">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <CalendarDays className="h-4 w-4" aria-hidden /> Planner
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {view === 'today' ? (
              <>Today <span className="font-normal text-muted-foreground">· {todayHeading(date)}</span></>
            ) : 'Upcoming'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {view === 'today'
              ? `${remaining} remaining · ${groups.completedToday.length} completed`
              : 'Next 14 days'}
          </p>
        </div>
        {(view === 'today' ? error : upcomingError) ? (
          <Button variant="outline" size="sm" onClick={() => void (view === 'today' ? load() : loadUpcoming())}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        ) : null}
      </header>

      <div className="mb-7 inline-flex rounded-lg border border-border/60 bg-muted/20 p-1" role="tablist" aria-label="Planner view">
        {(['today', 'upcoming'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={view === candidate}
            onClick={() => setView(candidate)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors',
              view === candidate && 'bg-background text-foreground shadow-sm',
            )}
          >
            {candidate}
          </button>
        ))}
      </div>

      {view === 'today' && error && visibleProjection ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4" /> Today could not refresh. Showing the last available data.
        </div>
      ) : null}

      {view === 'today' ? (remaining === 0 && groups.completedToday.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/20 px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" aria-hidden />
          <h2 className="font-semibold">Nothing scheduled for today</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use the existing Add Action flow when you want to schedule work.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.overdue.length ? (
            <section aria-labelledby="planner-overdue">
              <h2 id="planner-overdue" className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-destructive/90">Overdue</h2>
              {renderRows(groups.overdue, false, true)}
            </section>
          ) : null}
          {groups.today.length ? (
            <section aria-labelledby="planner-today">
              <h2 id="planner-today" className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today</h2>
              {renderRows(groups.today)}
            </section>
          ) : null}
          {groups.completedToday.length ? (
            <section aria-labelledby="planner-completed">
              <button
                type="button"
                onClick={() => setCompletedOpen((open) => !open)}
                className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {completedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span id="planner-completed">Completed today · {groups.completedToday.length}</span>
              </button>
              {completedOpen ? renderRows(groups.completedToday, true) : null}
            </section>
          ) : null}
        </div>
      )) : visibleUpcoming?.groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/20 px-6 py-14 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" aria-hidden />
          <h2 className="font-semibold">Nothing scheduled for the next 14 days</h2>
        </div>
      ) : (
        <div className="space-y-7">
          {visibleUpcoming?.groups.map((group) => (
            <section key={group.date} aria-labelledby={`planner-${group.date}`}>
              <h2 id={`planner-${group.date}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {upcomingHeading(group.date, date)}
              </h2>
              {renderRows(group.items)}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
