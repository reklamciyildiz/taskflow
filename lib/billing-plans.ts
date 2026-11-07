/** Creem test and live products must use the same approved tax-inclusive pricing.
 * This is the signed-off test configuration, not proof of live checkout behavior in all jurisdictions.
 */
export const CREEM_EXPECTED_TAX_MODE = 'inclusive' as const;
/** Public USD list prices; checkout product IDs come from Creem configuration. */
export const ACTIPROC_PLANS = {
  free: { priceUsd: 0, cadence: 'free', maxProcesses: 1, maxTeams: 1 },
  individual: { priceUsd: 12, cadence: 'yearly', maxProcesses: 3, maxTeams: 1 },
  pro: { priceUsd: 4, cadence: 'monthly', maxProcesses: 10, maxTeams: 3 },
  team: { priceUsd: 6, cadence: 'monthly', maxProcesses: Infinity, maxTeams: Infinity },
} as const;
export type PaidActiprocPlan = 'individual' | 'pro' | 'team';
export function isPaidPlan(v: unknown): v is PaidActiprocPlan { return v === 'individual' || v === 'pro' || v === 'team'; }


/** Authoritative public list prices. Annual Pro/Team renew every year per seat. */
export type BillingInterval = 'monthly' | 'yearly';
export const ACTIPROC_BILLING_PRICES = {
  individual: { yearly: 12 },
  pro: { monthly: 4, yearly: 40 },
  team: { monthly: 6, yearly: 60 },
} as const;
export function billingIntervalForPlan(plan: PaidActiprocPlan, input?: BillingInterval): BillingInterval {
  return plan === 'individual' ? 'yearly' : input === 'yearly' ? 'yearly' : 'monthly';
}
export function actiprocPriceUsd(plan: PaidActiprocPlan, interval: BillingInterval): number {
  const effective = billingIntervalForPlan(plan, interval);
  if (plan === 'individual') return ACTIPROC_BILLING_PRICES.individual.yearly;
  return ACTIPROC_BILLING_PRICES[plan][effective];
}
export function creemPeriodForInterval(interval: BillingInterval): 'every-month'|'every-year' {
  return interval === 'yearly' ? 'every-year' : 'every-month';
}
