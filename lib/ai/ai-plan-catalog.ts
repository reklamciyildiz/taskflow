/** Public Actiproc AI fair-use catalog.
 * Keep every UI disclosure and the server quota policy on the same values.
 * These are included request allowances, NOT credits for additional billing.
 */
export type AIPlanKey = 'free' | 'individual' | 'pro' | 'team';
export type AIPlanLimit = {
  dailyPerUser: number;
  monthlyBase: number;
  perSeat: boolean;
};
export const AI_MAX_FUNDED_SEATS = 20;
export const AI_BURST_REQUESTS_PER_MINUTE = 12;
export const AI_PLAN_LIMITS: Readonly<Record<AIPlanKey, AIPlanLimit>> = {
  free: { dailyPerUser: 10, monthlyBase: 30, perSeat: false },
  individual: { dailyPerUser: 50, monthlyBase: 300, perSeat: false },
  pro: { dailyPerUser: 100, monthlyBase: 800, perSeat: true },
  team: { dailyPerUser: 150, monthlyBase: 1200, perSeat: true },
} as const;

export function aiPlanMonthlyDescription(plan: AIPlanKey): string {
  const meta = AI_PLAN_LIMITS[plan];
  return `${meta.monthlyBase.toLocaleString('en-US')} AI requests/month${meta.perSeat ? ' per paid seat' : ''}`;
}
export function aiPlanDailyDescription(plan: AIPlanKey): string {
  return `Up to ${AI_PLAN_LIMITS[plan].dailyPerUser} requests/day per user`;
}
export function aiPlanMonthlyLimit(plan: AIPlanKey, verifiedSeatCount: number): number {
  const meta = AI_PLAN_LIMITS[plan];
  if (!meta.perSeat) return meta.monthlyBase;
  const seats = Number.isFinite(verifiedSeatCount)
    ? Math.min(AI_MAX_FUNDED_SEATS, Math.max(1, Math.floor(verifiedSeatCount)))
    : 1;
  return meta.monthlyBase * seats;
}

/** Client-side display helpers; enforcement always uses verified server entitlements. */
export function aiUsageThreshold(used: number, limit: number): 'normal' | 'warning' | 'exhausted' {
  if (!Number.isFinite(limit) || limit < 1) return 'exhausted';
  if (used >= limit) return 'exhausted';
  return used / limit >= 0.8 ? 'warning' : 'normal';
}
