"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CheckCircle2, Clock3, Loader2, RotateCcw, SkipForward, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addCalendarDays,
  calendarDatesInRange,
  isoWeekday,
} from "@/lib/scheduling-domain";
import {
  summarizeRecurrenceHistory,
  type RecurrenceHistory,
  type RecurrenceHistoryDay,
  type RecurrenceHistoryStatus,
} from "@/lib/recurrence-history";
import { plannerApi } from "@/lib/api";
import { dispatchOccurrenceChanged } from "@/lib/schedule-events";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const STATUS_LABEL: Record<RecurrenceHistoryStatus, string> = {
  completed: "Completed",
  skipped: "Skipped",
  missed: "Missed",
  today: "Pending today",
  upcoming: "Upcoming",
  rescheduled: "Moved to another date",
};
const STATUS_STYLE: Record<RecurrenceHistoryStatus, string> = {
  completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  skipped: "border-border/40 bg-muted/65 text-muted-foreground",
  missed: "border-rose-400/35 bg-rose-400/10 text-rose-600 dark:text-rose-300",
  today: "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/25",
  upcoming: "border-border/35 bg-muted/30 text-muted-foreground",
  rescheduled: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
};

function formatDay(date: string, withYear = false): string {
  const value = new Date(date + "T12:00:00Z");
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(value);
}

export function RecurrenceHistoryDialog({
  scheduleId,
  title,
  open,
  onOpenChange,
  canEdit,
}: {
  scheduleId: string | null;
  title: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  canEdit: boolean;
}) {
  const [history, setHistory] = useState<RecurrenceHistory | null>(null);
  const [range, setRange] = useState<7 | 30>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const visibleHistory = history?.scheduleId === scheduleId ? history : null;

  const load = useCallback(async () => {
    if (!scheduleId || !open) return;
    setLoading(true);
    setError(null);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    try {
      const response = await plannerApi.getHistory({ scheduleId, timeZone, days: 30 });
      if (!response.success || !response.data) throw new Error(response.error || "Could not load recurrence history.");
      setHistory(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load recurrence history.");
    } finally {
      setLoading(false);
    }
  }, [scheduleId, open]);

  useEffect(() => {
    if (!open) return;
    setRange(30);
    setSelectedDate(null);
    void load();
  }, [load, open]);

  const days = useMemo(() => visibleHistory?.days.filter(item =>
    range === 30 || item.date >= addCalendarDays(visibleHistory.today, -6)
  ) ?? [], [range, visibleHistory]);

  const stats = useMemo(() =>
    visibleHistory ? summarizeRecurrenceHistory(days, visibleHistory.today) : null,
  [days, visibleHistory]);

  const calendar = useMemo(() => {
    if (!visibleHistory) return [];
    const start = addCalendarDays(visibleHistory.today, 1 - range);
    return calendarDatesInRange(start, visibleHistory.today);
  }, [visibleHistory, range]);

  const offset = calendar.length ? isoWeekday(calendar[0]) - 1 : 0;
  const byDate = useMemo(() => new Map(days.map(day => [day.date, day])), [days]);
  const selected = selectedDate ? byDate.get(selectedDate) ?? null : null;

  const mutate = async (action: "complete" | "skip" | "uncomplete") => {
    if (!scheduleId || !selected || !canEdit || busy) return;
    setBusy(true);
    try {
      const response = await plannerApi.mutateOccurrence({
        scheduleId,
        occurrenceDate: selected.date,
        action,
      });
      if (!response.success) throw new Error(response.error || "Could not update this day.");
      dispatchOccurrenceChanged(scheduleId, selected.date);
      toast.success(action === "complete"
        ? "This day's occurrence was marked complete."
        : action === "skip"
          ? "This occurrence was skipped."
          : "This occurrence was restored to pending.");
      setSelectedDate(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update this day.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[min(94vw,590px)] max-w-[min(94vw,590px)] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left sm:px-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
            <CalendarDays className="h-4 w-4" aria-hidden/> Recurring history
          </div>
          <DialogTitle className="mt-2 pr-6 text-lg font-semibold leading-tight">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Each scheduled day is tracked separately. Past days can be corrected without completing the entire Action.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-border/60 bg-muted/30 p-1" role="group" aria-label="History window">
              {([7, 30] as const).map(value => (
                <button key={value} type="button" aria-pressed={range === value}
                  onClick={() => { setRange(value); setSelectedDate(null); }}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    range === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {value} days
                </button>
              ))}
            </div>
            {visibleHistory ? <span className="text-[11px] text-muted-foreground">{formatDay(visibleHistory.startDate)} – {formatDay(visibleHistory.today)}</span> : null}
          </div>

          {error ? (
            <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              {error} <Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button>
            </div>
          ) : loading && !visibleHistory ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin"/> Loading history…
            </div>
          ) : visibleHistory && stats ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Completion", value: stats.completionRate === null ? "—" : stats.completionRate + "%", icon: TrendingUp },
                  { label: "Done", value: String(stats.completed), icon: CheckCircle2 },
                  { label: "Missed", value: String(stats.missed), icon: Clock3 },
                  { label: "Skipped", value: String(stats.skipped), icon: SkipForward },
                ].map(metric => <div key={metric.label} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                  <metric.icon className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden/>
                  <div className="text-xl font-semibold tabular-nums">{metric.value}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{metric.label}</div>
                </div>)}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {stats.missedStreak > 0 ? stats.missedStreak + " recent scheduled days missed · " : ""}
                {stats.completionStreak > 0 ? stats.completionStreak + " previous scheduled days completed · " : ""}
                {stats.rescheduled > 0 ? stats.rescheduled + " moved · " : ""}
                Completion rate excludes skipped, moved and today's still-open occurrence.
              </p>

              <div className="rounded-2xl border border-border/60 bg-card/40 p-3 sm:p-4">
                <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
                  {WEEKDAYS.map((day, index) => <span key={index}>{day}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: offset }, (_, index) => <span aria-hidden key={"pad-" + index}/>)}
                  {calendar.map(date => {
                    const day = byDate.get(date);
                    return day ? (
                      <button
                        type="button" key={date}
                        aria-label={formatDay(date, true) + ": " + STATUS_LABEL[day.status]}
                        aria-pressed={selectedDate === date}
                        title={STATUS_LABEL[day.status]}
                        onClick={() => setSelectedDate(date)}
                        className={cn(
                          "flex aspect-square min-h-8 items-center justify-center rounded-lg border text-[11px] font-semibold tabular-nums transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          STATUS_STYLE[day.status],
                          selectedDate === date && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                      >
                        {day.status === "completed" ? <Check className="h-4 w-4" aria-hidden/> : Number(date.slice(-2))}
                      </button>
                    ) : (
                      <span key={date} className="flex aspect-square min-h-8 items-center justify-center rounded-lg bg-muted/20 text-[11px] tabular-nums text-muted-foreground/40" title="Not scheduled">
                        {Number(date.slice(-2))}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
                  {(["completed", "missed", "skipped", "rescheduled", "today"] as const).map(status => (
                    <span key={status} className="inline-flex items-center gap-1.5">
                      <span className={cn("h-2.5 w-2.5 rounded-[3px] border", STATUS_STYLE[status])}/>
                      {STATUS_LABEL[status]}
                    </span>
                  ))}
                </div>
              </div>

              {selected && (
                <section aria-label="Selected recurrence day" className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{formatDay(selected.date, true)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{STATUS_LABEL[selected.status]}</p>
                      {selected.effectiveDate !== selected.date && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Moved to {formatDay(selected.effectiveDate, true)}</p>
                      )}
                    </div>
                    <button type="button" aria-label="Clear day selection" onClick={() => setSelectedDate(null)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                      <X className="h-4 w-4"/>
                    </button>
                  </div>
                  {canEdit && selected.status !== "rescheduled" ? (
                    <div className="flex flex-wrap gap-2">
                      {selected.status === "completed" || selected.status === "skipped" ? (
                        <Button type="button" size="sm" variant="outline" disabled={busy}
                          onClick={() => void mutate("uncomplete")}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5"/> Restore to pending
                        </Button>
                      ) : (
                        <>
                          <Button type="button" size="sm" disabled={busy}
                            onClick={() => void mutate("complete")}>
                            <Check className="mr-1.5 h-3.5 w-3.5"/> Mark completed
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={busy}
                            onClick={() => void mutate("skip")}>
                            <SkipForward className="mr-1.5 h-3.5 w-3.5"/> Skip this day
                          </Button>
                        </>
                      )}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">{selected.status === "rescheduled" ? "This occurrence has been moved. Edit its date in Planner." : "Read-only history."}</p>}
                </section>
              )}
              {days.length === 0 && (
                <p className="rounded-lg bg-muted/25 p-4 text-center text-xs text-muted-foreground">
                  No scheduled occurrences in this window.
                </p>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
