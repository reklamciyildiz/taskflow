import Link from 'next/link';
import { CalendarDays, ChevronRight, Webhook, ShieldCheck } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';

const cards = [
  {
    title: 'Google Calendar',
    badge: 'Pro+',
    body: 'Sync due dates to a calendar you choose. Per-user connection — teammates keep their own Google account.',
    icon: CalendarDays,
    accent: 'emerald',
  },
  {
    title: 'Webhooks',
    badge: 'Team',
    body: 'Send signed events to Zapier, n8n, Make.com, or custom services — with logs and retries.',
    icon: Webhook,
    accent: 'violet',
  },
  {
    title: 'Built with guardrails',
    badge: 'All plans',
    body: 'Organization scoping + roles & permissions are consistent — plans gate capacity, not collaboration.',
    icon: ShieldCheck,
    accent: 'zinc',
  },
] as const;

function accentClasses(accent: (typeof cards)[number]['accent']) {
  if (accent === 'emerald') {
    return {
      ring: 'hover:border-emerald-500/30 hover:shadow-[0_0_40px_-16px_rgba(16,185,129,0.22)]',
      icon: 'text-emerald-300',
      badge: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20',
    };
  }
  if (accent === 'violet') {
    return {
      ring: 'hover:border-violet-500/30 hover:shadow-[0_0_44px_-18px_rgba(139,92,246,0.25)]',
      icon: 'text-violet-200',
      badge: 'bg-violet-500/10 text-violet-200 border-violet-500/20',
    };
  }
  return {
    ring: 'hover:border-white/[0.08] hover:shadow-[0_0_36px_-18px_rgba(255,255,255,0.08)]',
    icon: 'text-zinc-300',
    badge: 'bg-white/[0.04] text-zinc-200 border-white/[0.12]',
  };
}

export function MarketingIntegrationsStrip() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-20 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">Integrations</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl">
            Plug Axiom into your real workflow.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-500">
            Calendar for deadlines. Webhooks for automations. Guardrails for teams.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            const a = accentClasses(c.accent);
            return (
              <div
                key={c.title}
                className={cn(
                  'rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6 ring-1 ring-white/[0.04]',
                  'transition-[border-color,box-shadow] duration-300',
                  a.ring
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 shadow-inner', a.icon)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                      a.badge
                    )}
                  >
                    {c.badge}
                  </span>
                </div>
                <p className="mt-4 text-base font-semibold tracking-tight text-zinc-100">{c.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{c.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/auth/signup?callbackUrl=%2Fsettings%2Fbilling"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-emerald-500/25 hover:bg-white/[0.07]"
          >
            See plans & unlock integrations
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </MarketingReveal>
    </section>
  );
}

