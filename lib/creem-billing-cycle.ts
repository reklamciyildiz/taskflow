/**
 * Dates shown in Billing must come from Creem's authoritative subscription.
 * A period end is NOT necessarily the next card charge (scheduled cancellation,
 * failed payment, pause, etc.). Never derive renewal dates by adding 30 days.
 */
export type CreemBillingCycle = {
  currentPeriodStartAt: string | null;
  currentPeriodEndAt: string | null;
  nextChargeAt: string | null;
  nextChargeVerified: boolean;
};

export function creemUtcDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value)) return null;
  const time=Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function readCreemBillingCycle(raw: unknown): CreemBillingCycle {
  const sub:any=(raw as any)?.subscription??raw;
  const start=creemUtcDate(sub?.current_period_start_date);
  const end=creemUtcDate(sub?.current_period_end_date);
  const providerNext=creemUtcDate(sub?.next_transaction_date);
  const active=sub?.status==='active'||sub?.status==='trialing';
  const next=active && providerNext && (!start || Date.parse(providerNext)>=Date.parse(start))
    ? providerNext:null;
  return {
    currentPeriodStartAt:start,
    currentPeriodEndAt:end,
    nextChargeAt:next,
    nextChargeVerified:Boolean(next),
  };
}

/** This is a policy disclosure, NOT a price estimate or an exact new date.
 * Creem's documented immediate charge starts a new billing cycle.
 */
export const CREEM_IMMEDIATE_CYCLE_POLICY='new-cycle-on-immediate-charge' as const;
