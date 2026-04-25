import { CalendarClock, Check, Fingerprint, ListChecks, Sparkles, Webhook, Workflow } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const items = [
  {
    title: 'Actions that carry execution',
    body: 'Checklists, assignees, due dates, priorities, and notes live together — no scattered context.',
    icon: ListChecks,
  },
  {
    title: 'Dynamic processes',
    body: 'Define pipelines that match your work. One OS surface across teams and workflows.',
    icon: Workflow,
  },
  {
    title: 'Reminders + calendar sync',
    body: 'Advanced reminders and optional Google Calendar sync keep deadlines real without nagging.',
    icon: CalendarClock,
  },
  {
    title: 'Knowledge Hub (second brain)',
    body: 'Learnings and journal notes stay tied to real work — searchable across your system.',
    icon: Sparkles,
  },
  {
    title: 'Webhooks (Team plan)',
    body: 'Send signed events to Zapier, n8n, Make.com, or custom services with logs and retries.',
    icon: Webhook,
  },
  {
    title: 'Security boundaries',
    body: 'Organization scoping and role-based access so teams can move fast with guardrails.',
    icon: Fingerprint,
  },
] as const;

const bullets = [
  'Board + list views',
  'Assignments & ownership',
  'Due dates & reminders',
  'Checklists inside actions',
  'Knowledge Hub',
  'Multi-workspace support',
  'Customers (B2B layer)',
] as const;

export function MarketingEverythingYouGet() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">Everything you get</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl md:text-5xl">
            A complete system — not a feature salad.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-500">
            Axiom is designed so you can understand the whole product in one pass. Plans change limits — not your team’s
            ability to collaborate.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/[0.06] bg-zinc-950/60 p-6 ring-1 ring-white/[0.04] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Core surfaces</p>
            <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-zinc-900/40 px-4 py-3 text-sm text-zinc-200"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/90" aria-hidden />
                  <span className="leading-snug">{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-500">
                Want to see plan limits and upgrades?
              </div>
              <Link
                href="/auth/signup?callbackUrl=%2Fsettings%2Fbilling"
                className={cn(
                  'inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5',
                  'text-sm font-semibold text-zinc-100 transition-colors hover:border-emerald-500/25 hover:bg-white/[0.07]'
                )}
              >
                Compare plans
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <div
                  key={it.title}
                  className={cn(
                    'rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6 ring-1 ring-white/[0.04]',
                    'transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/25 hover:shadow-[0_0_44px_-18px_rgba(16,185,129,0.18)]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tracking-tight text-zinc-100">{it.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-500">{it.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 ring-1 ring-white/[0.04]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-zinc-950/70 text-emerald-300 shadow-inner">
                  <Workflow className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight text-emerald-100">
                    Plans gate capacity — the OS stays the same.
                  </p>
                  <p className="mt-1 text-sm text-emerald-200/80">
                    Roles & permissions work the same on every plan. Upgrade when you need more workspaces, processes,
                    or webhooks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MarketingReveal>
    </section>
  );
}

