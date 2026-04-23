'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lemon Squeezy published prices (USD) — keep in sync with your store. */
const PRICES = {
  pro: { monthly: 5, yearly: 50 },
  team: { monthly: 17, yearly: 170 },
} as const;

type Interval = 'monthly' | 'yearly';

function yearlySavingsVsMonthly(monthly: number, yearly: number): number {
  const full = monthly * 12;
  if (full <= 0) return 0;
  return Math.round(((full - yearly) / full) * 100);
}

const freeFeatures = [
  'Boards, tasks & checklists',
  'Due dates & “when due” reminder',
  'Single-user workspace',
  'Web app — fast, keyboard-friendly',
] as const;

const proFeatures = [
  'Everything in Free, plus:',
  'Advanced reminder presets',
  'Integrations & calendar depth',
  'Solo workspace (1 seat)',
] as const;

const teamFeatures = [
  'Everything in Pro, plus:',
  'Invite members & roles',
  'Per-seat billing (2+ seats)',
  'Shared org workspace',
] as const;

export function MarketingPricing() {
  const [interval, setInterval] = useState<Interval>('monthly');
  const pctOff = useMemo(
    () => yearlySavingsVsMonthly(PRICES.pro.monthly, PRICES.pro.yearly),
    []
  );

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-white/[0.06] bg-[#050505] px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/90">
          Pricing
        </p>
        <h2 className="mt-4 text-center text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl sm:leading-[1.1]">
          Ship work your team{' '}
          <span className="bg-gradient-to-r from-violet-200 via-white to-emerald-200/90 bg-clip-text text-transparent">
            can feel
          </span>
          .
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-zinc-400">
          Clear tiers for individuals and teams. Checkout runs on Lemon Squeezy — tax and receipts handled at
          payment time.
        </p>

        {/* Interval toggle */}
        <div className="mt-10 flex justify-center">
          <div
            className="inline-flex rounded-full border border-white/[0.1] bg-zinc-950/80 p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]"
            role="tablist"
            aria-label="Billing interval"
          >
            <button
              type="button"
              role="tab"
              aria-selected={interval === 'monthly'}
              className={cn(
                'relative rounded-full px-5 py-2 text-sm font-medium transition-colors',
                interval === 'monthly'
                  ? 'bg-white/[0.08] text-zinc-100 shadow-sm ring-1 ring-violet-400/35'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
              onClick={() => setInterval('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={interval === 'yearly'}
              className={cn(
                'relative rounded-full px-5 py-2 text-sm font-medium transition-colors',
                interval === 'yearly'
                  ? 'bg-white/[0.08] text-zinc-100 shadow-sm ring-1 ring-violet-400/35'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
              onClick={() => setInterval('yearly')}
            >
              Yearly
              <span className="ml-1.5 rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                ~{pctOff}% off
              </span>
            </button>
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:items-stretch">
          {/* Free */}
          <article className="flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/40 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-6">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Free</h3>
                <p className="mt-1 text-sm text-zinc-500">Start with essentials</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">$0</p>
                <p className="text-xs text-zinc-500">forever</p>
              </div>
            </div>
            <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-zinc-400">
              {freeFeatures.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-zinc-100 transition-colors hover:border-violet-400/25 hover:bg-white/[0.07]"
            >
              Create account
            </Link>
          </article>

          {/* Pro — highlighted */}
          <article className="relative flex flex-col rounded-2xl border border-violet-400/35 bg-gradient-to-b from-violet-500/[0.12] via-zinc-950/90 to-zinc-950 p-6 shadow-[0_0_48px_-16px_rgba(139,92,246,0.45)] sm:p-8">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-500 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Most popular
            </span>
            <div className="flex items-start justify-between gap-3 border-b border-violet-400/20 pb-6">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Pro</h3>
                <p className="mt-1 text-sm text-violet-100/70">Power features, solo seat</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  ${interval === 'monthly' ? PRICES.pro.monthly : PRICES.pro.yearly}
                </p>
                <p className="text-xs text-violet-100/65">
                  {interval === 'monthly' ? '/ month' : '/ year'}
                </p>
                <p className="mt-1 text-[11px] text-violet-200/80">
                  {interval === 'monthly'
                    ? `That's $${PRICES.pro.yearly} if billed yearly`
                    : `Equals ~$${(PRICES.pro.yearly / 12).toFixed(2)}/mo billed annually`}
                </p>
              </div>
            </div>
            <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-zinc-200/90">
              {proFeatures.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-violet-500 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Pro
            </Link>
          </article>

          {/* Team */}
          <article className="flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/40 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-6">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
                  Team
                  <Sparkles className="h-4 w-4 text-emerald-400/90" aria-hidden />
                </h3>
                <p className="mt-1 text-sm text-zinc-500">Per seat · invites & roles</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                  ${interval === 'monthly' ? PRICES.team.monthly : PRICES.team.yearly}
                </p>
                <p className="text-xs text-zinc-500">
                  {interval === 'monthly' ? '/ seat / month' : '/ seat / year'}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {interval === 'monthly'
                    ? `$${PRICES.team.yearly}/seat if billed yearly`
                    : `~$${(PRICES.team.yearly / 12).toFixed(2)}/seat/mo annually`}
                </p>
              </div>
            </div>
            <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-zinc-400">
              {teamFeatures.map((f) => (
                <li key={f} className="flex gap-2.5">
                  {f.startsWith('Everything') ? (
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" aria-hidden />
                  ) : (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500/80" aria-hidden />
                  )}
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-100 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/15"
            >
              Get Team
            </Link>
          </article>
        </div>

        <p className="mt-10 text-center text-xs text-zinc-600">
          Prices shown in USD. VAT or sales tax may apply at checkout based on your location.
        </p>
      </div>
    </section>
  );
}
