'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { aiUsageThreshold, AI_MAX_FUNDED_SEATS } from '@/lib/ai/ai-plan-catalog';
import { isCapacitorNative } from '@/lib/client/is-capacitor-native';
import { useAIUsage } from '@/components/ai/useAIUsage';

const nf = new Intl.NumberFormat('en-US');

export function AIUsageBillingCard() {
  const { status, loading, error, refresh } = useAIUsage(fetch);
  const native = typeof window !== 'undefined' && isCapacitorNative();

  const monthState = status ? aiUsageThreshold(status.monthly.used, status.monthly.limit) : 'normal';
  const dayState = status ? aiUsageThreshold(status.daily.used, status.daily.limit) : 'normal';
  const exhausted = monthState === 'exhausted' || dayState === 'exhausted';
  const nearLimit = !exhausted && (monthState === 'warning' || dayState === 'warning');
  const percent = status
    ? Math.min(100, Math.max(0, status.monthly.used / Math.max(1, status.monthly.limit) * 100))
    : 0;

  return (
    <section id="ai-allowance" aria-labelledby="ai-allowance-heading"
      className="relative overflow-hidden rounded-[24px] border border-border/75 bg-gradient-to-br from-primary/[0.065] via-card to-card shadow-[0_16px_50px_-36px_rgba(15,23,42,0.5)]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-28 h-64 w-64 rounded-full bg-indigo-500/[0.08] blur-3xl" />
      <div className="relative space-y-5 p-5 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Included with your plan</p>
              <h2 id="ai-allowance-heading" className="mt-1 text-xl font-semibold tracking-tight">Actiproc AI allowance</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Your verified organization quota, remaining requests and access status.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={loading}
            className="h-9 rounded-xl text-xs" onClick={refresh}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh usage
          </Button>
        </header>

        {error || (!loading && !status) ? (
          <div role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-xs leading-relaxed text-foreground">
            <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" aria-hidden />
            Live allowance could not be verified. Your subscription and purchases are unaffected. Retry before relying on any displayed quota.
          </div>
        ) : loading && !status ? (
          <div aria-label="Loading AI usage" aria-busy="true" className="grid animate-pulse gap-3 sm:grid-cols-3">
            <div className="h-24 rounded-xl bg-muted/50 sm:col-span-2" /><div className="h-24 rounded-xl bg-muted/50" />
          </div>
        ) : status ? (
          <>
            <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-[19px] border border-border/75 bg-background/75 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly AI usage · shared pool</p>
                  <span className="rounded-full border border-primary/15 bg-primary/[0.07] px-2.5 py-1 text-[10px] font-semibold capitalize text-primary">{status.plan} plan</span>
                </div>
                <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">{nf.format(status.monthly.used)}</span>
                  <span className="text-sm text-muted-foreground">/ {nf.format(status.monthly.limit)} used</span>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-primary">{nf.format(status.monthly.remaining)} left</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar"
                  aria-label="Monthly AI requests used" aria-valuemin={0} aria-valuemax={status.monthly.limit}
                  aria-valuenow={Math.min(status.monthly.used, status.monthly.limit)}>
                  <div className={`h-full rounded-full transition-[width] ${monthState === 'exhausted' ? 'bg-rose-500' : monthState === 'warning' ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Resets at 00:00 UTC on the first of each month</span>
                  {status.includedSeats > 1 && <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden /> {status.includedSeats} funded seats</span>}
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-[19px] border border-border/75 bg-background/75 p-4 sm:p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today · per user</p>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">{nf.format(status.daily.remaining)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">/ {nf.format(status.daily.limit)} left</span>
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">Resets at 00:00 UTC · 12 requests/minute anti-spam limit.</p>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold">
                  {status.access === 'available' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                    : <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />}
                  {status.access === 'available' ? 'AI access available'
                    : status.access === 'beta_only' ? 'AI access currently in beta'
                    : 'AI service not yet ready'}
                </p>
              </div>
            </div>

            {exhausted || nearLimit ? (
              <div role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs leading-relaxed ${exhausted ? 'border-rose-500/25 bg-rose-500/[0.05]' : 'border-amber-500/25 bg-amber-500/[0.05]'}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                {exhausted
                  ? (monthState === 'exhausted' ? 'Your shared monthly AI allowance is exhausted. It resets next UTC month; higher plans may increase the pool.' : 'Your daily AI allowance is exhausted. It resets at 00:00 UTC; your monthly balance remains available.')
                  : 'You have used at least 80% of a daily or monthly AI allowance. This is an informational alert; no additional charges will occur.'}
              </div>
            ) : null}

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <p className="flex max-w-2xl items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                Pro/Team monthly requests are shared by the organization. Funded AI capacity scales up to {AI_MAX_FUNDED_SEATS} verified seats. No automatic usage overages or charges.
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl text-xs" asChild>
                  <Link href="/ai">Open AI <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden /></Link>
                </Button>
                {!native && (status.plan === 'free' || status.plan === 'individual' || nearLimit || exhausted) && (
                  <Button type="button" size="sm" className="h-9 rounded-xl text-xs" asChild>
                    <a href="#billing-plans">Compare plans</a>
                  </Button>
                )}
              </div>
            </footer>
          </>
        ) : null}
      </div>
    </section>
  );
}
