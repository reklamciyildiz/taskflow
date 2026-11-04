'use client';

import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronDown, Sparkles } from 'lucide-react';
import { aiUsageThreshold } from '@/lib/ai/ai-plan-catalog';
import { isCapacitorNative } from '@/lib/client/is-capacitor-native';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAIUsage } from './useAIUsage';

const nf = new Intl.NumberFormat('en-US');

export function AIAllowanceIndicator({ request, refreshKey }: {
  request: typeof fetch;
  refreshKey: number;
}) {
  const { status, loading, error } = useAIUsage(request, refreshKey);
  const native = typeof window !== 'undefined' && isCapacitorNative();

  if (loading && !status) return (
    <div aria-label="Loading AI allowance" className="ml-auto h-9 w-[72px] shrink-0 animate-pulse rounded-xl bg-muted/55 sm:w-28"/>
  );
  if (error || !status) return (
    <span role="status" className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-2 py-2 text-[10px] font-medium text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true"/>
      <span className="hidden sm:inline">Usage unavailable</span>
      <span className="sm:hidden">Usage</span>
    </span>
  );

  const monthly = aiUsageThreshold(status.monthly.used, status.monthly.limit);
  const daily = aiUsageThreshold(status.daily.used, status.daily.limit);
  const exhausted = monthly === 'exhausted' || daily === 'exhausted';
  const warning = !exhausted && (monthly === 'warning' || daily === 'warning');
  const blockedReason = monthly === 'exhausted' ? 'Monthly AI limit reached'
    : daily === 'exhausted' ? 'Daily AI limit reached' : null;
  const usagePct = Math.min(100, 100 * status.monthly.used / Math.max(1, status.monthly.limit));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" role="status" aria-label="AI usage and access" title="View AI usage and plan"
          className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 bg-muted/45 px-2.5 text-foreground transition-colors hover:border-primary/30 hover:bg-muted/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:gap-2 sm:px-3">
          {exhausted || warning ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true"/> :
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true"/>}
          <span className="text-[11px] font-semibold tabular-nums text-foreground">
            {nf.format(status.monthly.remaining)}
          </span>
          <span className="hidden text-[10px] text-muted-foreground sm:inline">left</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true"/>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="z-[80] w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border-border/80 bg-card p-4 shadow-[0_22px_55px_-26px_hsl(var(--foreground)/0.3)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">AI usage</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Current plan allowances</p>
          </div>
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            {status.plan}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">Monthly requests</span>
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {nf.format(status.monthly.remaining)} left
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"
            aria-label="Monthly AI requests used" aria-valuemin={0} aria-valuemax={status.monthly.limit}
            aria-valuenow={Math.min(status.monthly.used, status.monthly.limit)}>
            <div className={'h-full rounded-full transition-[width] ' +
              (monthly === 'exhausted' ? 'bg-rose-500' : monthly === 'warning' ? 'bg-amber-500' : 'bg-primary')}
              style={{ width: usagePct + '%' }}/>
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">
            {nf.format(status.monthly.remaining)} / {nf.format(status.monthly.limit)} AI requests left this month
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-foreground">
            {warning || exhausted ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true"/> :
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true"/>}
            Daily requests
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-foreground">
            {nf.format(status.daily.remaining)} / {nf.format(status.daily.limit)}
          </span>
        </div>
        {blockedReason && <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">{blockedReason}</p>}
        {status.access !== 'available' && (
          <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
            {status.access === 'beta_only' ? 'AI access: beta rollout' : 'AI access not yet ready'}
          </p>
        )}
        <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
          Monthly allowance is shared across the organization. Daily limit resets at 00:00 UTC.
        </p>
        {(status.plan === 'free' || status.plan === 'individual') && !native && (
          <a href="/settings/billing" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline">
            Compare plans <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true"/>
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
