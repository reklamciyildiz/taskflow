"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  RefreshCw,
  Repeat2,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { plannerApi } from "@/lib/api";
import type { PlannerProjectionItem } from "@/lib/planner-projection";
import { addCalendarDays } from "@/lib/scheduling-domain";
import { formatDueDateYmdLocal } from "@/lib/due-date";
import { formatScheduleDate } from "@/lib/schedule-presentation";
import { useTaskContext } from "@/components/TaskContext";
import { PlannerScheduleDialog } from "./PlannerScheduleDialog";
import { dispatchOccurrenceChanged } from "@/lib/schedule-events";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function recurrenceLabel(item: PlannerProjectionItem) {
  const frequency = item.recurrenceFrequency;
  if (!frequency) return "Not recurring";

  if (frequency === "daily") {
    return item.recurrenceInterval > 1 ? `Every ${item.recurrenceInterval} days` : "Every day";
  }

  const days = item.recurrenceWeekdays.map((day) => WEEKDAYS[day - 1]).filter(Boolean).join(", ");
  const prefix = item.recurrenceInterval > 1 ? `Every ${item.recurrenceInterval} weeks` : "Every week";
  return days ? `${prefix} · ${days}` : prefix;
}

function sourceTitle(item: PlannerProjectionItem) {
  return item.checklistItemText || item.taskTitle;
}

export function PlannerRoutines() {
  const { currentTeam, openTaskEditor } = useTaskContext();
  const [items, setItems] = useState<PlannerProjectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlannerProjectionItem | null>(null);

  const today = useMemo(() => formatDueDateYmdLocal(new Date()), []);

  const load = useCallback(
    async (fresh = false) => {
      if (!currentTeam?.id) return;
      setLoading(true);
      setError(null);
      try {
        const response = await plannerApi.getRoutines({ teamId: currentTeam.id, startDate: today }, fresh);
        if (!response.success) throw new Error(response.error || "Routines could not be loaded.");
        setItems(response.data ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Routines could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [currentTeam?.id, today]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load(true);
    window.addEventListener("schedule:changed", refresh);
    window.addEventListener("occurrence:changed", refresh);
    return () => {
      window.removeEventListener("schedule:changed", refresh);
      window.removeEventListener("occurrence:changed", refresh);
    };
  }, [load]);

  const mutateOccurrence = async (
    item: PlannerProjectionItem,
    action: "complete" | "skip" | "reschedule"
  ) => {
    const key = `${item.scheduleId}:${item.effectiveDate}:${action}`;
    setBusyKey(key);
    try {
      const response = await plannerApi.mutateOccurrence({
        scheduleId: item.scheduleId,
        occurrenceDate: item.occurrenceDate,
        action,
        effectiveDate:
          action === "reschedule" ? addCalendarDays(item.effectiveDate, 1) : undefined,
      });
      if (!response.success) throw new Error(response.error || "The occurrence could not be updated.");
      toast.success(
        action === "complete"
          ? "Next occurrence completed."
          : action === "skip"
            ? "Next occurrence skipped."
            : "Next occurrence moved one day."
      );
      dispatchOccurrenceChanged(item.scheduleId, item.occurrenceDate);
      await load(true);
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "The occurrence could not be updated."
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="planner-v2-section planner-v2-routines" aria-labelledby="planner-routines-title">
      <header className="planner-v2-section-header">
        <div>
          <div className="planner-v2-eyebrow">
            <Repeat2 aria-hidden="true" /> Recurring work
          </div>
          <h2 id="planner-routines-title">Routines</h2>
          <p>Manage recurring Actions and Checklist items without creating a second habit system.</p>
        </div>
        <button
          type="button"
          className="planner-v2-icon-button"
          onClick={() => void load(true)}
          aria-label="Refresh routines"
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />
        </button>
      </header>

      {loading ? (
        <div className="planner-v2-stack" aria-label="Loading routines">
          {[0, 1, 2].map((index) => (
            <div key={index} className="planner-v2-routine-row planner-v2-skeleton" />
          ))}
        </div>
      ) : error ? (
        <div className="planner-v2-state planner-v2-state-error">
          <p>{error}</p>
          <button type="button" onClick={() => void load(true)}>Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="planner-v2-state">
          <Repeat2 aria-hidden="true" />
          <h3>No routines yet</h3>
          <p>Add recurrence to an Action or Checklist schedule and it will appear here.</p>
        </div>
      ) : (
        <div className="planner-v2-stack">
          {items.map((item) => {
            const skipKey = `${item.scheduleId}:${item.effectiveDate}:skip`;
            const moveKey = `${item.scheduleId}:${item.effectiveDate}:reschedule`;
            const completeKey = `${item.scheduleId}:${item.effectiveDate}:complete`;
            return (
              <article key={item.scheduleId} className="planner-v2-routine-row">
                <div className="planner-v2-source-icon" aria-hidden="true">
                  {item.source.sourceType === "action" ? <CalendarClock /> : <CheckSquare2 />}
                </div>
                <div className="planner-v2-routine-content">
                  <div className="planner-v2-row-title-line">
                    <h3>{sourceTitle(item)}</h3>
                    <span className="planner-v2-source-badge">
                      {item.source.sourceType === "action" ? "Action" : "Checklist"}
                    </span>
                  </div>
                  <p>{item.projectName ? `${item.projectName} · ` : "Personal · "}{recurrenceLabel(item)}</p>
                  <div className="planner-v2-routine-next">
                    <Clock3 aria-hidden="true" />
                    Next: {formatScheduleDate(item.effectiveDate)}
                    {item.scheduleTime ? ` · ${item.scheduleTime.slice(0, 5)}` : " · All day"}
                    {item.durationMinutes ? ` · ${item.durationMinutes} min` : ""}
                  </div>
                </div>
                <div className="planner-v2-row-actions">
                  <button
                    type="button"
                    onClick={() => void mutateOccurrence(item, "complete")}
                    disabled={busyKey !== null}
                    aria-busy={busyKey === completeKey}
                    title="Complete the next occurrence only"
                  >
                    <CheckCircle2 aria-hidden="true" />
                    <span>Complete next</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutateOccurrence(item, "skip")}
                    disabled={busyKey !== null}
                    aria-busy={busyKey === skipKey}
                    title="Skip the next occurrence only"
                  >
                    <SkipForward aria-hidden="true" />
                    <span>Skip next</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutateOccurrence(item, "reschedule")}
                    disabled={busyKey !== null}
                    aria-busy={busyKey === moveKey}
                    title="Move the next occurrence one day"
                  >
                    <RotateCcw aria-hidden="true" />
                    <span>Move +1 day</span>
                  </button>
                  <button type="button" onClick={() => setEditing(item)}>
                    <Repeat2 aria-hidden="true" />
                    <span>Edit series</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTaskEditor(item.taskId, item.checklistItemId)}
                    aria-label={`Open ${sourceTitle(item)}`}
                  >
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PlannerScheduleDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        source={editing?.source ?? null}
        title={editing ? sourceTitle(editing) : ""}
        onSaved={() => void load(true)}
      />
    </section>
  );
}
