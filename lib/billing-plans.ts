/** Creem test products use tax-inclusive pricing: taxes are included in the customer-facing price when applicable.
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
