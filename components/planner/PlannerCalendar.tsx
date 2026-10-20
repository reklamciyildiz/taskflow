'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, FolderKanban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskContext } from '@/components/TaskContext';
import { plannerApi } from '@/lib/api';
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
  const { currentTeam, tasks, projects, generalBoardColumns, openTaskEditor } = useTaskContext();
  const today = formatDueDateYmdLocal(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [items, setItems] = useState<PlannerProjectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ source: WorkSource; title: string; occurrence?: PlannerProjectionItem } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const [focusRequest, setFocusRequest] = useState<TimelineFocusRequest>({ hour: 0, token: 0, date: null });
  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index)),
    [weekStart],
  );

  const load = useCallback(async () => {
    if (!currentTeam) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      setLoading(false);
    }
  }, [currentTeam, weekStart]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setAllDayExpanded(false); }, [selectedDate]);
  useEffect(() => {
    const refresh = () => void load();
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
  }).slice(0, 12);

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

  return (
    <section className="planner-v2-section planner-v2-calendar" aria-labelledby="planner-calendar-title">
      <header className="planner-v2-section-header">
        <div>
          <div className="planner-v2-eyebrow"><CalendarClock aria-hidden="true" /> Time blocks</div>
          <h2 id="planner-calendar-title">Calendar</h2>
          <p>Plan time without losing the source Action or Checklist context.</p>
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
            />
          </div>
        </>
      )}

      <section className="planner-v2-anytime">
        <div className="mb-2 flex items-center justify-between">
          <div><h2 className="text-sm font-semibold">Anytime</h2><p className="text-xs text-muted-foreground">Unscheduled active Actions</p></div>
          <span className="text-xs tabular-nums text-muted-foreground">{anytime.length}</span>
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {anytime.map((task) => (
            <div key={task.id} className="flex min-h-12 items-center gap-2 rounded-lg px-2 hover:bg-muted/35">
              <button className="min-w-0 flex-1 text-left" onClick={() => openTaskEditor(task.id)}>
                <span className="block truncate text-sm font-medium">{task.title}</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><FolderKanban className="h-3 w-3" />{projects.find((project) => project.id === task.projectId)?.name ?? 'No Process'}</span>
              </button>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setEditing({ source: { sourceType: 'action', taskId: task.id }, title: task.title })} aria-label={`Schedule ${task.title}`}><Plus className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        {!anytime.length ? <p className="py-5 text-center text-sm text-muted-foreground">No unscheduled work.</p> : null}
      </section>

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
        onSaved={() => void load()}
      />
    </section>
  );
}
