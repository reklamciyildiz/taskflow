"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarRange, ListChecks, Repeat2 } from "lucide-react";
import { PlannerToday } from "@/components/PlannerToday";
import { cn } from "@/lib/utils";
import { PlannerCalendar } from "./PlannerCalendar";
import { PlannerQuickAdd } from "./PlannerQuickAdd";
import { PlannerRoutines } from "./PlannerRoutines";
import { PlannerTeamSwitcher } from './PlannerTeamSwitcher';
import { usePlannerRuntime } from './PlannerRuntime';

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

/** Platform-neutral Planner presentation shared by Next.js and Capacitor. */
export function PlannerV2View() {
  const { currentTeam, loading } = usePlannerRuntime();
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
        <PlannerTeamSwitcher />
      </header>

      {!currentTeam ? (
        <section className="planner-v2-section flex min-h-44 items-center justify-center px-6 text-center">
          <div className="max-w-md">
            <h2 className="text-base font-semibold">Choose a workspace</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {loading
                ? 'Loading the workspaces you can access…'
                : 'Select a workspace above to load its Planner. Your choice is remembered on this device.'}
            </p>
          </div>
        </section>
      ) : (
        <>
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
        </>
      )}
    </main>
  );
}
