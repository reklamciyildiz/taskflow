'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

type AIAllowanceStatus = {
  plan: 'free' | 'individual' | 'pro' | 'team';
  period: 'calendar_month_utc';
  daily: { used: number; limit: number; remaining: number };
  monthly: { used: number; limit: number; remaining: number };
};

export function AIAllowanceIndicator({ request, refreshKey }: {
  request: typeof fetch;
  refreshKey: number;
}) {
  const [status, setStatus] = useState<AIAllowanceStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void request('/api/ai/usage', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable');
        return response.json() as Promise<AIAllowanceStatus>;
      })
      .then((result) => {
        if (!active) return;
        setStatus(result);
        setUnavailable(false);
      })
      .catch(() => {
        if (!active) return;
        setStatus(null);
        setUnavailable(true);
      });
    return () => { active = false; };
  }, [request, refreshKey]);

  if (unavailable) return (
    <p role="status" className="hidden text-[11px] text-amber-600 sm:block">
      AI availability is not verified
    </p>
  );
  if (!status) return null;
  const exhausted = status.monthly.remaining === 0 || status.daily.remaining === 0;
  const blockedReason = status.monthly.remaining === 0 ? 'Monthly AI limit reached'
    : status.daily.remaining === 0 ? 'Daily AI limit reached' : null;
  const number = new Intl.NumberFormat('en-US');
  return (
    <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3" role="status">
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
        <Sparkles className="h-3 w-3" aria-hidden />
        {status.plan}
      </span>
      <div className="min-w-0 text-right text-[10px] leading-tight text-muted-foreground" title="Monthly requests are shared by the organization. Daily requests are per user. UTC calendar periods.">
        <p className={exhausted ? 'font-semibold text-amber-600' : 'font-semibold text-foreground'}>
          {blockedReason ?? `${number.format(status.monthly.remaining)} / ${number.format(status.monthly.limit)} AI requests left this month`}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {number.format(status.daily.remaining)} / {number.format(status.daily.limit)} today · UTC reset
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" role="progressbar"
          aria-label="Monthly AI requests used" aria-valuemin={0} aria-valuemax={status.monthly.limit}
          aria-valuenow={status.monthly.used}>
          <div className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, status.monthly.used / Math.max(1, status.monthly.limit) * 100))}%` }} />
        </div>
      </div>
      {(status.plan === 'free' || status.plan === 'individual') && (
        <a href="/settings/billing"
          className="hidden shrink-0 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[10px] font-semibold text-primary hover:bg-primary/15 sm:inline-flex">
          See plans
        </a>
      )}
    </div>
  );
}
