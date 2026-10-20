"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarRange, ListChecks, Repeat2 } from "lucide-react";
import { PlannerToday } from "@/components/PlannerToday";
import { cn } from "@/lib/utils";
import { PlannerCalendar } from "./PlannerCalendar";
import { PlannerQuickAdd } from "./PlannerQuickAdd";
import { PlannerRoutines } from "./PlannerRoutines";

type PlannerView = "today" | "calendar" | "routines";

const VIEWS: Array<{
  id: PlannerView;
  label: string;
  description: string;
  icon: typeof CalendarDays;
}> = [
  { id: "today", label: "Today", description: "Daily agenda", icon: ListChecks },
  { id: "calendar", label: "Calendar", description: "Day and week", icon: CalendarRange },
  { id: "routines", label: "Routines", description: "Recurring work", icon: Repeat2 },
];

export function PlannerV2() {
  const [view, setView] = useState<PlannerView>("today");
  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(new Date()),
    []
  );

  return (
    <main className="planner-v2 mx-auto w-full max-w-[1480px] pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header className="planner-v2-hero">
        <div className="min-w-0">
          <div className="planner-v2-eyebrow">
            <CalendarDays aria-hidden="true" /> {dateLabel}
          </div>
          <h1>Planner</h1>
          <p>Shape the day, protect your time, and keep recurring work moving.</p>
        </div>
      </header>

      <PlannerQuickAdd />

      <nav className="planner-v2-tabs" aria-label="Planner views">
        {VIEWS.map((candidate) => {
          const Icon = candidate.icon;
          return (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={view === candidate.id}
              onClick={() => setView(candidate.id)}
              className={cn(view === candidate.id && "is-active")}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{candidate.label}</strong>
                <small>{candidate.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="planner-v2-content" role="tabpanel">
        {view === "today" ? (
          <section className="planner-v2-section planner-v2-today" aria-label="Today agenda">
            <PlannerToday embedded />
          </section>
        ) : null}
        {view === "calendar" ? <PlannerCalendar /> : null}
        {view === "routines" ? <PlannerRoutines /> : null}
      </div>
    </main>
  );
}
