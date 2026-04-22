import { organizationDb, teamMemberDb } from '@/lib/db';

export type PlanName = 'free' | 'pro' | 'team';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

export type OrganizationBilling = {
  id: string;
  plan_name: PlanName | string | null;
  subscription_status: SubscriptionStatus | string | null;
  variant_id: string | null;
  ls_customer_id: string | null;
  ls_subscription_id: string | null;
  seat_limit?: number | null;
};

export type Entitlements = {
  plan: PlanName;
  subscriptionStatus: SubscriptionStatus;
  /** For Team plan only; for Free/Pro this is always 1. */
  seatLimit: number;
};

function normalizePlan(plan: unknown): PlanName {
  const p = String(plan ?? 'free').trim().toLowerCase();
  if (p === 'team') return 'team';
  if (p === 'pro') return 'pro';
  return 'free';
}

function normalizeStatus(status: unknown): SubscriptionStatus {
  const s = String(status ?? 'active').trim().toLowerCase();
  if (s === 'cancelled') return 'cancelled';
  if (s === 'past_due') return 'past_due';
  if (s === 'trialing') return 'trialing';
  return 'active';
}

export function isPaidActive(status: SubscriptionStatus): boolean {
  // We still allow access during trialing / past_due; finance ops can tighten later.
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

export function getSeatLimitFromPlan(plan: PlanName): number {
  if (plan === 'team') return Number.POSITIVE_INFINITY; // overridden by org.seat_limit when present
  return 1;
}

export function canUseAdvancedReminders(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus'>): boolean {
  if (ent.plan === 'free') return false;
  return isPaidActive(ent.subscriptionStatus);
}

export function canInviteMembers(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus'>): boolean {
  if (ent.plan !== 'team') return false;
  return isPaidActive(ent.subscriptionStatus);
}

export async function getOrganizationEntitlements(organizationId: string): Promise<Entitlements> {
  const org: any = await organizationDb.getById(organizationId);
  const plan = normalizePlan(org?.plan_name);
  const subscriptionStatus = normalizeStatus(org?.subscription_status);
  const baseSeatLimit = getSeatLimitFromPlan(plan);
  const seatLimit =
    plan === 'team' && Number.isFinite(Number(org?.seat_limit)) && Number(org?.seat_limit) > 0
      ? Number(org.seat_limit)
      : baseSeatLimit;
  return { plan, subscriptionStatus, seatLimit };
}

export async function getOrganizationSeatUsage(organizationId: string): Promise<number> {
  const users: any[] = await teamMemberDb.listDistinctUsersForOrganization(organizationId);
  return Array.isArray(users) ? users.length : 0;
}

