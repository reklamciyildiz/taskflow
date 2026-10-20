'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, FolderKanban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskContext } from '@/components/TaskContext';
import { plannerApi } from '@/lib/api';
import { addCalendarDays, isoWeekday, type WorkSource } from '@/lib/scheduling-domain';
import { formatDueDateYmdLocal } from '@/lib/due-date';
import type { PlannerProjectionItem } from '@/lib/planner-projection';
import { isTerminalBoardColumn, FALLBACK_BOARD_COLUMNS } from '@/lib/types';
import { PlannerScheduleDialog } from './PlannerScheduleDialog';
import { OCCURRENCE_CHANGED_EVENT, SCHEDULE_CHANGED_EVENT } from '@/lib/schedule-events';
import { cn } from '@/lib/utils';
import { layoutPlannerTimeline } from '@/lib/planner-v2-utils';

function dayLabel(date: string, long = false) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', day: 'numeric' }).format(new Date(y, m - 1, d, 12));
}
function weekdayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(y, m - 1, d, 12));
}
function startOfWeek(date: string) { return addCalendarDays(date, 1 - isoWeekday(date)); }
function minutes(time: string | null) { if (!time) return 0; const [h, m] = time.split(':').map(Number); return h * 60 + m; }
function timeRange(item: PlannerProjectionItem) {
  if (!item.scheduleTime) return 'All day';
  const start = minutes(item.scheduleTime);
  const duration = item.durationMinutes ?? 30;
  const end = start + duration;
  const endLabel = `${String(Math.floor((end % 1440) / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  return `${item.scheduleTime.slice(0, 5)}–${endLabel}${end >= 1440 ? ' +1d' : ''}`;
}

function Timeline({ items, onEdit, selectedDate, today }: { items: PlannerProjectionItem[]; onEdit: (item: PlannerProjectionItem) => void; selectedDate: string; today: string }) {
  const timed = layoutPlannerTimeline(items.filter((item) => item.scheduleTime));
  const nowHour = new Date().getHours();
  const firstHour = timed.length ? Math.floor(Math.min(...timed.map(({ item }) => minutes(item.scheduleTime))) / 60) : null;
  const lastMinute = timed.length ? Math.max(...timed.map(({ item }) => minutes(item.scheduleTime) + (item.durationMinutes ?? 30))) : null;
  const startHour = firstHour === null ? (selectedDate === today ? Math.max(0, nowHour - 1) : 8) : Math.max(0, firstHour - 1);
  const endHour = Math.min(24, Math.max(startHour + 8, lastMinute === null ? startHour + 8 : Math.ceil(lastMinute / 60) + 1));
  const pxPerHour = 54;
  return <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-border/40 bg-card/30">
    <div style={{ height: (endHour - startHour) * pxPerHour }} className="relative ml-14">
      {Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index).map((hour) => <div key={hour} className="absolute left-0 right-0 border-t border-border/35" style={{ top: (hour - startHour) * pxPerHour }}><span className="absolute -left-12 -top-2.5 w-10 text-right text-[10px] tabular-nums text-muted-foreground">{String(hour).padStart(2, '0')}:00</span></div>)}
      {timed.map(({ item, lane, lanes }) => {
        const top = ((minutes(item.scheduleTime) - startHour * 60) / 60) * pxPerHour;
        const height = Math.max(36, ((item.durationMinutes ?? 30) / 60) * pxPerHour);
        return <button key={item.id} onClick={() => onEdit(item)} className="absolute overflow-hidden rounded-lg border border-primary/20 bg-primary/12 px-2 py-1.5 text-left shadow-sm transition hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ top, height, left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}>
          <span className="block truncate text-xs font-semibold">{item.checklistItemText || item.taskTitle}</span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{timeRange(item)}{item.durationMinutes ? ` · ${item.durationMinutes}m` : ''}</span>
        </button>;
      })}
    </div>
  </div>;
}

function WeekTimeline({ dates, items, onEdit }: {
  dates: string[];
  items: PlannerProjectionItem[];
  onEdit: (item: PlannerProjectionItem) => void;
}) {
  const timed = items.filter((item) => item.scheduleTime);
  const firstMinute = timed.length ? Math.min(...timed.map((item) => minutes(item.scheduleTime))) : 8 * 60;
  const lastMinute = timed.length ? Math.max(...timed.map((item) => minutes(item.scheduleTime) + (item.durationMinutes ?? 30))) : 17 * 60;
  const startHour = Math.max(0, Math.floor(firstMinute / 60) - 1);
  const endHour = Math.min(24, Math.max(startHour + 9, Math.ceil(lastMinute / 60) + 1));
  const pxPerHour = 48;
  const height = (endHour - startHour) * pxPerHour;

  return (
    <div className="planner-v2-week hidden overflow-x-auto rounded-2xl border border-border/40 bg-card/30 md:block">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border/40">
          <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All day</div>
          {dates.map((date) => (
            <div key={date} className="min-h-10 border-l border-border/30 p-1">
              {items.filter((item) => item.effectiveDate === date && !item.scheduleTime).slice(0, 2).map((item) => (
                <button key={item.id} type="button" onClick={() => onEdit(item)} className="block w-full truncate rounded-md bg-primary/10 px-1.5 py-1 text-left text-[10px] hover:bg-primary/15">
                  {item.checklistItemText || item.taskTitle}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height }}>
            {Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index).map((hour) => (
              <span key={hour} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: (hour - startHour) * pxPerHour }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {dates.map((date) => {
            const blocks = layoutPlannerTimeline(items.filter((item) => item.effectiveDate === date && item.scheduleTime));
            return (
              <div key={date} className="relative border-l border-border/30" style={{ height }}>
                {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
                  <span key={index} className="absolute left-0 right-0 border-t border-border/25" style={{ top: index * pxPerHour }} />
                ))}
                {blocks.map(({ item, lane, lanes }) => {
                  const top = ((minutes(item.scheduleTime) - startHour * 60) / 60) * pxPerHour;
                  const blockHeight = Math.max(28, ((item.durationMinutes ?? 30) / 60) * pxPerHour);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onEdit(item)}
                      className="absolute overflow-hidden rounded-md border border-primary/20 bg-primary/12 px-1.5 py-1 text-left hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ top, height: blockHeight, left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                    >
                      <span className="block truncate text-[10px] font-semibold">{item.checklistItemText || item.taskTitle}</span>
                      {blockHeight >= 38 ? <span className="block truncate text-[9px] text-muted-foreground">{timeRange(item)}</span> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PlannerCalendar() {
  const { currentTeam, tasks, projects, generalBoardColumns, openTaskEditor } = useTaskContext();
  const today = formatDueDateYmdLocal(new Date()); const [selectedDate, setSelectedDate] = useState(today);
  const [mode, setMode] = useState<'day' | 'week'>('day'); const [items, setItems] = useState<PlannerProjectionItem[]>([]);
  const [loading, setLoading] = useState(true); const [editing, setEditing] = useState<{ source: WorkSource; title: string; occurrence?: PlannerProjectionItem } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const weekStart = startOfWeek(selectedDate); const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)), [weekStart]);
  const load = useCallback(async () => {
    if (!currentTeam) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const response = await plannerApi.getUpcoming({ startDate: weekStart, teamId: currentTeam.id, horizonDays: '7' }, true);
      if (!response.success || !response.data) throw new Error(response.error || 'Calendar could not be loaded.');
      setItems(response.data.groups.flatMap((group) => group.items));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Calendar could not be loaded.');
    } finally { setLoading(false); }
  }, [currentTeam, weekStart]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setAllDayExpanded(false); }, [selectedDate]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener(SCHEDULE_CHANGED_EVENT, refresh); window.addEventListener(OCCURRENCE_CHANGED_EVENT, refresh); return () => { window.removeEventListener(SCHEDULE_CHANGED_EVENT, refresh); window.removeEventListener(OCCURRENCE_CHANGED_EVENT, refresh); }; }, [load]);
  const selectedItems = items.filter((item) => item.effectiveDate === selectedDate && item.state !== 'skipped');
  const allDay = selectedItems.filter((item) => !item.scheduleTime);
  const visibleAllDay = allDayExpanded ? allDay : allDay.slice(0, 3);
  const anytime = tasks.filter((task) => {
    if (task.teamId !== currentTeam?.id || task.schedule) return false;
    const columns = task.projectId ? projects.find((project) => project.id === task.projectId)?.columnConfig ?? [] : generalBoardColumns.length ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    return !isTerminalBoardColumn(task.status, columns);
  }).slice(0, 12);
  const editItem = (item: PlannerProjectionItem) => setEditing({ source: item.source, title: item.checklistItemText || item.taskTitle, occurrence: item });
  return <section className="planner-v2-section planner-v2-calendar" aria-labelledby="planner-calendar-title">
    <header className="planner-v2-section-header">
      <div><div className="planner-v2-eyebrow"><CalendarClock aria-hidden="true" /> Time blocks</div><h2 id="planner-calendar-title">Calendar</h2><p>Plan time without losing the source Action or Checklist context.</p></div>
      <div className="planner-v2-calendar-controls"><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => setSelectedDate(addCalendarDays(selectedDate, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button><Button variant="ghost" className="h-10" onClick={() => setSelectedDate(today)}>Today</Button><Button variant="ghost" size="icon" onClick={() => setSelectedDate(addCalendarDays(selectedDate, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button></div><div className="rounded-lg bg-muted/35 p-1"><Button size="sm" variant={mode === 'day' ? 'secondary' : 'ghost'} onClick={() => setMode('day')}>Day</Button><Button size="sm" variant={mode === 'week' ? 'secondary' : 'ghost'} onClick={() => setMode('week')}>Week</Button></div></div>
    </header>
    <div className="planner-v2-week-strip grid grid-cols-7 gap-1 rounded-xl bg-muted/20 p-1.5">{weekDates.map((date) => <button key={date} onClick={() => { setSelectedDate(date); setAllDayExpanded(false); }} aria-current={date === today ? 'date' : undefined} className={cn('relative min-h-14 rounded-lg px-1 text-xs transition', date === selectedDate ? 'bg-primary text-primary-foreground shadow-sm' : date === today ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'hover:bg-muted/60')}><span className="block truncate text-[10px] font-semibold uppercase tracking-wide opacity-75">{weekdayLabel(date)}</span><strong className="mt-0.5 block text-sm">{Number(date.slice(-2))}</strong>{date === today && date !== selectedDate ? <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" /> : null}</button>)}</div>
    {loading ? <Skeleton className="h-[520px] rounded-2xl" /> : error ? <div className="planner-v2-state planner-v2-state-error"><CalendarClock aria-hidden="true" /><h3>Calendar could not be loaded</h3><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div> : <>
      {mode === 'week' ? <WeekTimeline dates={weekDates} items={items} onEdit={editItem} /> : null}
      <div className={cn(mode === 'week' && 'md:hidden')}>
        <h2 className="mb-2 text-sm font-semibold">{dayLabel(selectedDate, true)}</h2>
        {allDay.length ? <div className="planner-v2-all-day mb-3 rounded-xl bg-muted/20 p-2"><div className="flex min-h-8 items-center justify-between gap-2 px-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All day · {allDay.length}</p>{allDay.length > 3 ? <button type="button" className="min-h-8 text-xs font-medium text-primary" onClick={() => setAllDayExpanded((value) => !value)}>{allDayExpanded ? 'Show less' : `Show ${allDay.length - 3} more`}</button> : null}</div>{visibleAllDay.map((item) => <button key={item.id} onClick={() => editItem(item)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-muted/45"><CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="line-clamp-1 text-sm">{item.checklistItemText || item.taskTitle}</span><span className="ml-auto shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">{item.source.sourceType === 'action' ? 'Action' : 'Checklist'}</span></button>)}</div> : null}
        <Timeline items={selectedItems} onEdit={editItem} selectedDate={selectedDate} today={today} />
      </div>
    </>}
    <section className="planner-v2-anytime"><div className="mb-2 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Anytime</h2><p className="text-xs text-muted-foreground">Unscheduled active Actions</p></div><span className="text-xs tabular-nums text-muted-foreground">{anytime.length}</span></div><div className="grid gap-1 sm:grid-cols-2">{anytime.map((task) => <div key={task.id} className="flex min-h-12 items-center gap-2 rounded-lg px-2 hover:bg-muted/35"><button className="min-w-0 flex-1 text-left" onClick={() => openTaskEditor(task.id)}><span className="block truncate text-sm font-medium">{task.title}</span><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><FolderKanban className="h-3 w-3" />{projects.find((project) => project.id === task.projectId)?.name ?? 'No Process'}</span></button><Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setEditing({ source: { sourceType: 'action', taskId: task.id }, title: task.title })} aria-label={`Schedule ${task.title}`}><Plus className="h-4 w-4" /></Button></div>)}</div>{!anytime.length ? <p className="py-5 text-center text-sm text-muted-foreground">No unscheduled work.</p> : null}</section>
    <PlannerScheduleDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} source={editing?.source ?? null} title={editing?.title ?? ''} occurrence={editing?.occurrence ?? null} onSaved={() => void load()} />
  </section>;
}
