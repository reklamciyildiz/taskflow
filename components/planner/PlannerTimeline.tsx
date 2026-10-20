'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { PlannerProjectionItem } from '@/lib/planner-projection';
import { layoutPlannerTimeline } from '@/lib/planner-v2-utils';

const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const DAY_PX_PER_HOUR = 64;
const WEEK_PX_PER_HOUR = 52;

export type TimelineFocusRequest = { hour: number; token: number; date: string | null };

function minutes(time: string | null) {
  if (!time) return 0;
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function slotTime(slot: number) {
  const total = slot * 30;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeRange(item: PlannerProjectionItem) {
  if (!item.scheduleTime) return 'All day';
  const start = minutes(item.scheduleTime);
  const duration = item.durationMinutes ?? 30;
  const end = start + duration;
  const endLabel = `${String(Math.floor((end % 1440) / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  return `${item.scheduleTime.slice(0, 5)}–${endLabel}${end >= 1440 ? ' +1d' : ''}`;
}

function useTimelineFocus(
  scrollRef: React.RefObject<HTMLDivElement>,
  dateKey: string,
  focusHour: number,
  focusRequest: TimelineFocusRequest,
  pxPerHour: number,
) {
  const previousRef = useRef('');
  useEffect(() => {
    const key = `${dateKey}:${focusRequest.token}`;
    if (previousRef.current === key || !scrollRef.current) return;
    previousRef.current = key;
    const container = scrollRef.current;
    const top = Math.max(0, focusHour * pxPerHour - container.clientHeight * 0.22);
    container.scrollTop = top;
  }, [dateKey, focusHour, focusRequest.token, pxPerHour, scrollRef]);
}

export function preferredTimelineHour(items: PlannerProjectionItem[], date: string, today: string) {
  if (date === today) return new Date().getHours();
  const timed = items.filter((item) => item.scheduleTime);
  return timed.length ? Math.max(0, Math.floor(Math.min(...timed.map((item) => minutes(item.scheduleTime))) / 60) - 1) : 8;
}

export function DayTimeline({
  date,
  today,
  items,
  focusRequest,
  onEdit,
  onCreateAt,
}: {
  date: string;
  today: string;
  items: PlannerProjectionItem[];
  focusRequest: TimelineFocusRequest;
  onEdit: (item: PlannerProjectionItem) => void;
  onCreateAt: (date: string, time: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timed = useMemo(() => layoutPlannerTimeline(items.filter((item) => item.scheduleTime)), [items]);
  const focusHour = focusRequest.date === date ? focusRequest.hour : preferredTimelineHour(items, date, today);
  const canCreate = date >= today;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  useTimelineFocus(scrollRef, date, focusHour, focusRequest, DAY_PX_PER_HOUR);

  return (
    <div
      ref={scrollRef}
      className="planner-v2-timeline-scroll relative overflow-x-hidden overflow-y-auto rounded-2xl border border-border/40 bg-card/30"
      tabIndex={0}
      aria-label={`24-hour timeline for ${date}. Scroll vertically to reach every hour.`}
      data-planner-timeline="day"
    >
      <div className="relative ml-14" style={{ height: DAY_END_HOUR * DAY_PX_PER_HOUR }}>
        {Array.from({ length: DAY_END_HOUR + 1 }, (_, hour) => (
          <div key={hour} className="pointer-events-none absolute left-0 right-0 border-t border-border/35" style={{ top: hour * DAY_PX_PER_HOUR }}>
            <span className="absolute -left-12 -top-2.5 w-10 text-right text-[10px] tabular-nums text-muted-foreground">
              {String(hour).padStart(2, '0')}:00
            </span>
          </div>
        ))}
        {Array.from({ length: 48 }, (_, slot) => {
          const time = slotTime(slot);
          return (
            <button
              key={time}
              type="button"
              disabled={!canCreate}
              onClick={() => onCreateAt(date, time)}
              className="planner-v2-empty-slot group absolute left-0 right-0 z-0 text-left disabled:cursor-not-allowed"
              style={{ top: slot * (DAY_PX_PER_HOUR / 2), height: DAY_PX_PER_HOUR / 2 }}
              aria-label={canCreate ? `Create Action on ${date} at ${time}` : `Past time ${date} at ${time}`}
              data-slot-time={time}
            >
              <span aria-hidden="true">+ {time}</span>
            </button>
          );
        })}
        {date === today ? (
          <div className="planner-v2-now-line pointer-events-none absolute left-0 right-0 z-20" style={{ top: (nowMinutes / 60) * DAY_PX_PER_HOUR }}>
            <span>Now</span>
          </div>
        ) : null}
        {timed.map(({ item, lane, lanes }) => {
          const top = (minutes(item.scheduleTime) / 60) * DAY_PX_PER_HOUR;
          const height = Math.max(36, ((item.durationMinutes ?? 30) / 60) * DAY_PX_PER_HOUR);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onEdit(item)}
              className="absolute z-10 overflow-hidden rounded-lg border border-primary/25 bg-primary/12 px-2 py-1.5 text-left shadow-sm transition hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ top, height, left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
              aria-label={`Edit ${item.checklistItemText || item.taskTitle}, ${timeRange(item)}`}
            >
              <span className="block truncate text-xs font-semibold">{item.checklistItemText || item.taskTitle}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{timeRange(item)}{item.durationMinutes ? ` · ${item.durationMinutes}m` : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WeekTimeline({
  dates,
  selectedDate,
  today,
  items,
  focusRequest,
  onEdit,
  onCreateAt,
}: {
  dates: string[];
  selectedDate: string;
  today: string;
  items: PlannerProjectionItem[];
  focusRequest: TimelineFocusRequest;
  onEdit: (item: PlannerProjectionItem) => void;
  onCreateAt: (date: string, time: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedItems = items.filter((item) => item.effectiveDate === selectedDate);
  const focusHour = focusRequest.date === selectedDate ? focusRequest.hour : preferredTimelineHour(selectedItems, selectedDate, today);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  useTimelineFocus(scrollRef, dates.join(','), focusHour, focusRequest, WEEK_PX_PER_HOUR);

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
        <div ref={scrollRef} className="planner-v2-timeline-scroll overflow-x-hidden overflow-y-auto" tabIndex={0} aria-label="24-hour week timeline" data-planner-timeline="week">
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            <div className="relative" style={{ height: DAY_END_HOUR * WEEK_PX_PER_HOUR }}>
              {Array.from({ length: DAY_END_HOUR + 1 }, (_, hour) => (
                <span key={hour} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: hour * WEEK_PX_PER_HOUR }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {dates.map((date) => {
              const blocks = layoutPlannerTimeline(items.filter((item) => item.effectiveDate === date && item.scheduleTime));
              return (
                <div key={date} className="relative border-l border-border/30" style={{ height: DAY_END_HOUR * WEEK_PX_PER_HOUR }}>
                  {Array.from({ length: DAY_END_HOUR + 1 }, (_, hour) => (
                    <span key={hour} className="pointer-events-none absolute left-0 right-0 border-t border-border/25" style={{ top: hour * WEEK_PX_PER_HOUR }} />
                  ))}
                  {Array.from({ length: DAY_END_HOUR }, (_, hour) => (
                    <button
                      key={hour}
                      type="button"
                      disabled={date < today}
                      onClick={() => onCreateAt(date, `${String(hour).padStart(2, '0')}:00`)}
                      className="planner-v2-empty-slot absolute left-0 right-0 z-0 disabled:cursor-not-allowed"
                      style={{ top: hour * WEEK_PX_PER_HOUR, height: WEEK_PX_PER_HOUR }}
                      aria-label={date >= today ? `Create Action on ${date} at ${String(hour).padStart(2, '0')}:00` : `Past time on ${date}`}
                    />
                  ))}
                  {date === today ? <div className="planner-v2-now-line pointer-events-none absolute left-0 right-0 z-20" style={{ top: (nowMinutes / 60) * WEEK_PX_PER_HOUR }} /> : null}
                  {blocks.map(({ item, lane, lanes }) => {
                    const top = (minutes(item.scheduleTime) / 60) * WEEK_PX_PER_HOUR;
                    const blockHeight = Math.max(28, ((item.durationMinutes ?? 30) / 60) * WEEK_PX_PER_HOUR);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onEdit(item)}
                        className="absolute z-10 overflow-hidden rounded-md border border-primary/20 bg-primary/12 px-1.5 py-1 text-left hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ top, height: blockHeight, left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                        aria-label={`Edit ${item.checklistItemText || item.taskTitle}, ${timeRange(item)}`}
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
    </div>
  );
}
