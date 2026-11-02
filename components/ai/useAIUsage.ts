'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AIPlanKey } from '@/lib/ai/ai-plan-catalog';

export type AIUsageStatus = {
  plan: AIPlanKey;
  access: 'available' | 'beta_only' | 'not_ready';
  period: 'calendar_month_utc';
  includedSeats: number;
  daily: { used: number; limit: number; remaining: number };
  monthly: { used: number; limit: number; remaining: number };
  asOf: string;
};

function validCounter(value: unknown): value is { used: number; limit: number; remaining: number } {
  if (!value || typeof value !== 'object') return false;
  const v = value as { used?: unknown; limit?: unknown; remaining?: unknown };
  return [v.used, v.limit, v.remaining].every((n) =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0)
    && typeof v.limit === 'number' && v.limit > 0
    && typeof v.remaining === 'number'
    && typeof v.used === 'number'
    && v.remaining === Math.max(0, v.limit - v.used);
}

function isAIUsageStatus(data: unknown): data is AIUsageStatus {
  if (!data || typeof data !== 'object') return false;
  const result = data as Partial<AIUsageStatus>;
  return ['free', 'individual', 'pro', 'team'].includes(String(result.plan))
    && ['available', 'beta_only', 'not_ready'].includes(String(result.access))
    && result.period === 'calendar_month_utc'
    && typeof result.includedSeats === 'number'
    && result.includedSeats >= 1 && Number.isFinite(result.includedSeats)
    && validCounter(result.daily) && validCounter(result.monthly)
    && typeof result.asOf === 'string';
}

export function useAIUsage(request: typeof fetch, refreshKey = 0) {
  const [status, setStatus] = useState<AIUsageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void request('/api/ai/usage', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('AI allowance unavailable');
        const data: unknown = await response.json();
        if (!isAIUsageStatus(data)) throw new Error('Invalid allowance response');
        return data;
      })
      .then((result) => {
        if (!active) return;
        setStatus(result);
        setError(false);
      })
      .catch(() => {
        if (!active) return;
        setStatus(null); // Never show old allowances after failed verification.
        setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, refreshKey, revision]);

  return { status, loading, error, refresh };
}
