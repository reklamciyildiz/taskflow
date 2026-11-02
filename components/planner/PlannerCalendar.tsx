'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, FolderKanban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePlannerRuntime } from './PlannerRuntime';
import { addCalendarDays, isoWeekday, type WorkSource } from '@/lib/scheduling-domain';
import { formatDueDateYmdLocal } from '@/lib/due-date';
import type { PlannerProjectionItem } from '@/lib/planner-projection';
import { isTerminalBoardColumn, FALLBACK_BOARD_COLUMNS } from '@/lib/types';
import { PlannerScheduleDialog } from './PlannerScheduleDialog';
import {
  dispatchPlannerCaptureTime,
  OCCURRENCE_CHANGED_EVENT,
  SCHEDULE_CHANGED_EVENT,
} from '@/lib/schedule-events';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PlannerDropTarget } from '@/lib/planner-drag-reschedule';
import { plannerDragSupported } from '@/lib/planner-drag-reschedule';
import { dispatchScheduleChanged } from '@/lib/schedule-events';
import { DayTimeline, WeekTimeline, type TimelineFocusRequest } from './PlannerTimeline';

function dayLabel(date: string, long = false) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, long
    ? { weekday: 'long', month: 'long', day: 'numeric' }
    : { weekday: 'short', day: 'numeric' })
    .format(new Date(year, month - 1, day, 12));
}

function weekdayLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(year, month - 1, day, 12));
}

function startOfWeek(date: string) {
  return addCalendarDays(date, 1 - isoWeekday(date));
}

export function PlannerCalendar() {
  const { currentTeam, tasks, projects, generalBoardColumns, openTaskEditor, plannerApi, scheduleApi } = usePlannerRuntime();
  const today = formatDueDateYmdLocal(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [items, setItems] = useState<PlannerProjectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ source: WorkSource; title: string; occurrence?: PlannerProjectionItem } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveReview, setMoveReview] = useState<{ item: PlannerProjectionItem; target: PlannerDropTarget } | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const [anytimeOpen, setAnytimeOpen] = useState(false);
  const [anytimeLimit, setAnytimeLimit] = useState(20);
  const [focusRequest, setFocusRequest] = useState<TimelineFocusRequest>({ hour: 0, token: 0, date: null });
  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index)),
    [weekStart],
  );

  const load = useCallback(async (silent = false) => {
    if (!currentTeam) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await plannerApi.getUpcoming({
        startDate: weekStart,
        teamId: currentTeam.id,
        horizonDays: '7',
      }, true);
      if (!response.success || !response.data) throw new Error(response.error || 'Calendar could not be loaded.');
      setItems(response.data.groups.flatMap((group) => group.items));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Calendar could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentTeam, plannerApi, weekStart]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setAllDayExpanded(false); }, [selectedDate]);
  useEffect(() => {
    const refresh = () => void load(true);
    window.addEventListener(SCHEDULE_CHANGED_EVENT, refresh);
    window.addEventListener(OCCURRENCE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(SCHEDULE_CHANGED_EVENT, refresh);
      window.removeEventListener(OCCURRENCE_CHANGED_EVENT, refresh);
    };
  }, [load]);

  const selectedItems = items.filter((item) => item.effectiveDate === selectedDate && item.state !== 'skipped');
  const allDay = selectedItems.filter((item) => !item.scheduleTime);
  const visibleAllDay = allDayExpanded ? allDay : allDay.slice(0, 3);
  const anytime = tasks.filter((task) => {
    if (task.teamId !== currentTeam?.id || task.schedule) return false;
    const columns = task.projectId
      ? projects.find((project) => project.id === task.projectId)?.columnConfig ?? []
      : generalBoardColumns.length ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    return !isTerminalBoardColumn(task.status, columns);
  });
  const visibleAnytime = anytime.slice(0, 4);
  const visibleAnytimeSheet = anytime.slice(0, anytimeLimit);

  const requestMove = (item: PlannerProjectionItem, target: PlannerDropTarget) => {
    if (!plannerDragSupported(item.isRecurring, item.scheduleTime)) {
      toast.info('Recurring time blocks are changed through their schedule editor.');
      return;
    }
    setMoveReview({ item, target });
  };
  const applyMove = async () => {
    if (!moveReview || moveBusy) return;
    const { item, target } = moveReview;
    if (!plannerDragSupported(item.isRecurring, item.scheduleTime)) return;
    setMoveBusy(true);
    try {
      // Fail closed on stale calendar data. Never replace another user's recurrence
      // or erase newly edited reminders with an old projection snapshot.
      const current = await scheduleApi.get(item.source);
      if (!current.success || !current.data || current.data.id !== item.scheduleId ||
          current.data.scheduleType !== 'one_off' ||
          current.data.scheduleDate !== item.scheduleDate ||
          current.data.scheduleTime?.slice(0, 5) !== item.scheduleTime?.slice(0, 5)) {
        throw new Error('This event has changed since your calendar loaded. Refresh and try again.');
      }
      const response = await scheduleApi.save({
        source: item.source, scheduleType: 'one_off',
        scheduleDate: target.date, scheduleTime: target.time,
        timeZone: current.data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        durationMinutes: current.data.durationMinutes ?? 30,
        reminderRules: current.data.reminderRules,
      });
      if (!response.success || !response.data) throw new Error(response.error || 'Calendar change could not be saved.');
      dispatchScheduleChanged(item.source, response.data);
      setMoveReview(null);
      setSelectedDate(target.date);
      toast.success('Time block rescheduled.');
      void load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reschedule time block.');
    } finally {
      setMoveBusy(false);
    }
  };
  const editItem = (item: PlannerProjectionItem) => setEditing({
    source: item.source,
    title: item.checklistItemText || item.taskTitle,
    occurrence: item,
  });
  const focusHour = (hour: number, date = selectedDate) => setFocusRequest((current) => ({ hour, date, token: current.token + 1 }));
  const goToToday = () => {
    setSelectedDate(today);
    focusHour(new Date().getHours(), today);
  };
  const selectEmptyTime = (date: string, time: string) => dispatchPlannerCaptureTime(date, time);
  const openAnytimeTask = (taskId: string) => {
    setAnytimeOpen(false);
    openTaskEditor(taskId);
  };
  const scheduleAnytimeTask = (task: (typeof anytime)[number]) => {
    setAnytimeOpen(false);
    setEditing({ source: { sourceType: 'action', taskId: task.id }, title: task.title });
  };

  const renderAnytimeTask = (task: (typeof anytime)[number]) => (
    <div key={task.id} className="planner-v2-anytime-row flex min-w-0 items-center gap-2 rounded-lg">
      <button className="min-w-0 flex-1 overflow-hidden text-left" onClick={() => openAnytimeTask(task.id)}>
        <span className="line-clamp-2 break-words text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{task.title}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
          <FolderKanban className="h-3 w-3 shrink-0" />
          <span className="truncate">{projects.find((project) => project.id === task.projectId)?.name ?? 'No Process'}</span>
        </span>
      </button>
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => scheduleAnytimeTask(task)} aria-label={`Schedule ${task.title}`}><Plus className="h-4 w-4" /></Button>
    </div>
  );

  return (
    <section className="planner-v2-section planner-v2-calendar" aria-labelledby="planner-calendar-title">
      <header className="planner-v2-section-header">
        <div>
          <div className="planner-v2-eyebrow"><CalendarClock aria-hidden="true" /> Time blocks</div>
          <h2 id="planner-calendar-title">Calendar</h2>
          <p>Drag a block to another time in 15-minute steps, or click to edit. Checklist items remain linked to their Action.</p>
        </div>
        <div className="planner-v2-calendar-controls">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addCalendarDays(selectedDate, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" className="h-10" onClick={goToToday}>Today</Button>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addCalendarDays(selectedDate, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="rounded-lg bg-muted/35 p-1">
            <Button size="sm" variant={mode === 'day' ? 'secondary' : 'ghost'} onClick={() => setMode('day')}>Day</Button>
            <Button size="sm" variant={mode === 'week' ? 'secondary' : 'ghost'} onClick={() => setMode('week')}>Week</Button>
          </div>
        </div>
      </header>

      <div className="planner-v2-week-strip grid grid-cols-7 gap-1 rounded-xl bg-muted/20 p-1.5">
        {weekDates.map((date) => (
          <button
            key={date}
            type="button"
            onClick={() => setSelectedDate(date)}
            aria-current={date === today ? 'date' : undefined}
            aria-pressed={date === selectedDate}
            className={cn(
              'relative min-h-14 rounded-lg px-1 text-xs transition',
              date === selectedDate
                ? 'bg-primary text-primary-foreground shadow-sm'
                : date === today ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'hover:bg-muted/60',
            )}
          >
            <span className="block truncate text-[10px] font-semibold uppercase tracking-wide opacity-75">{weekdayLabel(date)}</span>
            <strong className="mt-0.5 block text-sm">{Number(date.slice(-2))}</strong>
            {date === today && date !== selectedDate ? <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" /> : null}
          </button>
        ))}
      </div>

      <div className="planner-v2-timeline-toolbar" aria-label="Timeline navigation">
        <div>
          <Clock3 aria-hidden="true" />
          <span>24-hour timeline</span>
        </div>
        <div>
          <label>
            <span className="sr-only">Jump to hour</span>
            <select value="" onChange={(event) => { if (event.target.value) focusHour(Number(event.target.value)); }} aria-label="Jump to hour">
              <option value="">Jump to…</option>
              {[0, 2, 6, 8, 12, 14, 18, 22, 23].map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
            </select>
          </label>
          <button type="button" onClick={goToToday}>Now</button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[520px] rounded-2xl" />
      ) : error ? (
        <div className="planner-v2-state planner-v2-state-error">
          <CalendarClock aria-hidden="true" />
          <h3>Calendar could not be loaded</h3>
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>Try again</button>
        </div>
      ) : (
        <>
          {mode === 'week' ? (
            <WeekTimeline
              dates={weekDates}
              selectedDate={selectedDate}
              today={today}
              items={items.filter((item) => item.state !== 'skipped')}
              focusRequest={focusRequest}
              onEdit={editItem}
              onCreateAt={selectEmptyTime}
              onMoveRequest={requestMove}
            />
          ) : null}
          <div className={cn(mode === 'week' && 'md:hidden')}>
            <h2 className="mb-2 text-sm font-semibold">{dayLabel(selectedDate, true)}</h2>
            {allDay.length ? (
              <div className="planner-v2-all-day mb-3 rounded-xl bg-muted/20 p-2">
                <div className="flex min-h-8 items-center justify-between gap-2 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All day · {allDay.length}</p>
                  {allDay.length > 3 ? (
                    <button type="button" className="min-h-8 text-xs font-medium text-primary" onClick={() => setAllDayExpanded((value) => !value)}>
                      {allDayExpanded ? 'Show less' : `Show ${allDay.length - 3} more`}
                    </button>
                  ) : null}
                </div>
                {visibleAllDay.map((item) => (
                  <button key={item.id} type="button" onClick={() => editItem(item)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-muted/45">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="line-clamp-1 text-sm">{item.checklistItemText || item.taskTitle}</span>
                    <span className="ml-auto shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">{item.source.sourceType === 'action' ? 'Action' : 'Checklist'}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <DayTimeline
              date={selectedDate}
              today={today}
              items={selectedItems}
              focusRequest={focusRequest}
              onEdit={editItem}
              onCreateAt={selectEmptyTime}
              onMoveRequest={requestMove}
            />
          </div>
        </>
      )}

      <section className="planner-v2-anytime min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <div><h2 className="text-sm font-semibold">Anytime</h2><p className="text-xs text-muted-foreground">Unscheduled active Actions</p></div>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{anytime.length}</span>
            {anytime.length > visibleAnytime.length ? <button type="button" className="min-h-10 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10" onClick={() => setAnytimeOpen(true)}>View all</button> : null}
          </div>
        </div>
        <div className="grid min-w-0 gap-1 sm:grid-cols-2">
          {visibleAnytime.map(renderAnytimeTask)}
        </div>
        {!anytime.length ? <p className="py-5 text-center text-sm text-muted-foreground">No unscheduled work.</p> : null}
      </section>

      <Sheet open={anytimeOpen} onOpenChange={(open) => { setAnytimeOpen(open); if (!open) setAnytimeLimit(20); }}>
        <SheetContent side="bottom" className="planner-v2-anytime-sheet flex max-h-[min(82dvh,46rem)] flex-col rounded-t-2xl p-0">
          <SheetHeader className="border-b border-border/45 px-5 pb-4 pt-5 text-left">
            <SheetTitle>Anytime Actions</SheetTitle>
            <SheetDescription>{anytime.length} unscheduled active Actions. Select one to open it or use the plus button to schedule it.</SheetDescription>
          </SheetHeader>
          <div className="grid min-h-0 min-w-0 gap-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:grid-cols-2">
            {visibleAnytimeSheet.map(renderAnytimeTask)}
            {visibleAnytimeSheet.length < anytime.length ? (
              <Button variant="ghost" className="mx-auto my-2 min-h-11 w-full max-w-xs" onClick={() => setAnytimeLimit((current) => current + 20)}>
                Show more ({anytime.length - visibleAnytimeSheet.length} remaining)
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(moveReview)} onOpenChange={(open) => { if (!open && !moveBusy) setMoveReview(null); }}>
        <DialogContent className="max-w-[min(94vw,460px)] rounded-[24px] border border-border/70 p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/70 bg-primary/[0.045] px-6 py-5 text-left">
            <DialogTitle className="text-lg font-semibold">Move this time block?</DialogTitle>
            <DialogDescription className="pt-1 text-xs leading-relaxed">Review the time before saving to your calendar.</DialogDescription>
          </DialogHeader>
          {moveReview ? (
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-border/75 bg-muted/25 p-4">
                <p className="line-clamp-2 text-sm font-semibold">{moveReview.item.checklistItemText || moveReview.item.taskTitle}</p>
                <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{moveReview.item.source.sourceType === 'checklist_item' ? 'Checklist item' : 'Action'}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-muted-foreground">From</p><p className="mt-1 font-semibold tabular-nums">{moveReview.item.effectiveDate}<br />{moveReview.item.scheduleTime?.slice(0,5)}</p></div>
                  <div><p className="text-primary">To</p><p className="mt-1 font-semibold tabular-nums text-primary">{moveReview.target.date}<br />{moveReview.target.time}</p></div>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">Only this one-time block moves. Duration, reminders and the original Action/Checklist link remain intact. Recurring series must be edited separately.</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" type="button" disabled={moveBusy} className="h-11 rounded-xl" onClick={() => setMoveReview(null)}>Cancel</Button>
                <Button type="button" disabled={moveBusy} className="h-11 rounded-xl px-5 font-semibold" onClick={() => void applyMove()}>
                  {moveBusy ? 'Saving…' : 'Confirm new time'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <PlannerScheduleDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        source={editing?.source ?? null}
        title={editing?.title ?? ''}
        occurrence={editing?.occurrence ?? null}
        onOpenSource={editing ? () => {
          const source = editing.source;
          setEditing(null);
          openTaskEditor(source.taskId, source.sourceType === 'checklist_item' ? source.checklistItemId : undefined);
        } : undefined}
      />
    </section>
  );
}
