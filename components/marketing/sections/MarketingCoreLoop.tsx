import { Brain, Bell, CalendarDays, CheckCircle2, ClipboardList, UserCheck2 } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';

const steps = [
  {
    title: 'Capture → Action',
    body: 'Turn thoughts into concrete actions fast — without losing context or momentum.',
    icon: ClipboardList,
  },
  {
    title: 'Break down → Assign',
    body: 'Checklists, owners, due dates, and priorities live inside each action — so execution stays clear.',
    icon: UserCheck2,
  },
  {
    title: 'Ship → Learn',
    body: 'Progress stays visible. Learnings land in your Knowledge Hub — attached to the work that created them.',
    icon: Brain,
  },
] as const;

const included = [
  { label: 'Roles & permissions (same across plans)', icon: CheckCircle2 },
  { label: 'Assignments, due dates, reminders', icon: Bell },
  { label: 'Google Calendar sync for due dates', icon: CalendarDays },
] as const;

export function MarketingCoreLoop() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl md:text-5xl">
            The loop: capture, ship, remember.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-500">
            Processes organize actions. Actions hold checklists, owners, and due dates. The Knowledge Hub keeps what you
            learned tied to real work — so the system gets smarter over time.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.title}
                className={cn(
                  'rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6 ring-1 ring-white/[0.04]',
                  'transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/25 hover:shadow-[0_0_44px_-18px_rgba(16,185,129,0.18)]'
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-zinc-100">{it.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{it.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-950/60 ring-1 ring-white/[0.04]">
          <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-3 sm:items-center">
            <div className="sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Included by design</p>
              <p className="mt-2 text-sm text-zinc-500">
                These aren’t “add-ons”. They’re foundational so teams can run real work from day one.
              </p>
            </div>
            <ul className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {included.map((x) => {
                const Icon = x.icon;
                return (
                  <li key={x.label} className="rounded-xl border border-white/[0.06] bg-zinc-900/40 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="text-sm font-medium leading-snug text-zinc-200">{x.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </MarketingReveal>
    </section>
  );
}

