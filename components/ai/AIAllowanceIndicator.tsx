'use client';

import { AlertTriangle, ArrowUpRight, CheckCircle2, Sparkles } from 'lucide-react';
import { aiUsageThreshold } from '@/lib/ai/ai-plan-catalog';
import { isCapacitorNative } from '@/lib/client/is-capacitor-native';
import { useAIUsage } from './useAIUsage';

const nf = new Intl.NumberFormat('en-US');

export function AIAllowanceIndicator({ request, refreshKey }: {
  request: typeof fetch;
  refreshKey: number;
}) {
  const { status, loading, error } = useAIUsage(request, refreshKey);
  const native = typeof window !== 'undefined' && isCapacitorNative();

  if (loading && !status) return (
    <div aria-label="Loading AI allowance" className="ml-auto h-9 w-40 animate-pulse rounded-xl bg-muted/55 sm:w-56" />
  );
  if (error || !status) return (
    <span role="status" className="ml-auto flex items-center gap-1.5 text-[11px] text-amber-600">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> AI allowance unavailable
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
    <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3" role="status" aria-label="AI usage and access">
      <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-foreground/85 sm:inline-flex">
        <Sparkles className="h-3 w-3 text-primary" aria-hidden />{status.plan}
      </div>
      <div className="min-w-0 max-w-[200px] text-right text-[10px] leading-tight sm:min-w-[164px]">
        <p className="truncate font-semibold text-foreground" title="Shared monthly organization allowance; no automatic overage charges">
          {blockedReason ?? `${nf.format(status.monthly.remaining)} / ${nf.format(status.monthly.limit)} AI requests left this month`}
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"
          aria-label="Monthly AI requests used" aria-valuemin={0} aria-valuemax={status.monthly.limit}
          aria-valuenow={Math.min(status.monthly.used, status.monthly.limit)}>
          <div className={`h-full rounded-full transition-[width] ${exhausted ? 'bg-rose-500' : warning ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${usagePct}%` }} />
        </div>
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {warning || exhausted ? <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />
            : <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden />}
          {nf.format(status.daily.remaining)} / {nf.format(status.daily.limit)} today · UTC
        </p>
        {status.access !== 'available' && (
          <p className="mt-1 text-[10px] font-medium text-amber-600">
            {status.access === 'beta_only' ? 'AI access: beta rollout' : 'AI access not yet ready'}
          </p>
        )}
      </div>
      {(status.plan === 'free' || status.plan === 'individual') && !native && (
        <a href="/settings/billing"
          className="hidden shrink-0 items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-2 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15 lg:inline-flex">
          See plans <ArrowUpRight className="h-3 w-3" aria-hidden />
        </a>
      )}
    </div>
  );
}
