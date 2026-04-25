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
  /** Maximum allowed seats for this organization (used for invites / access caps). */
  seatLimit: number;
};

export type PlanLimits = {
  maxTeams: number;
  maxProcesses: number;
  canUseWebhooks: boolean;
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
  if (plan === 'free') return 2;
  if (plan === 'pro') return Number.POSITIVE_INFINITY; // Pro is per-seat; enforcement is handled via billing later.
  return Number.POSITIVE_INFINITY; // Team overridden by org.seat_limit when present
}

export function canUseAdvancedReminders(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus'>): boolean {
  if (ent.plan === 'free') return false;
  return isPaidActive(ent.subscriptionStatus);
}

export function canInviteMembers(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus'>): boolean {
  if (ent.plan === 'free') return true; // capped by seatLimit (=2)
  if (ent.plan === 'pro') return isPaidActive(ent.subscriptionStatus);
  return isPaidActive(ent.subscriptionStatus);
}

export function getPlanLimits(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus'>): PlanLimits {
  // Note: we treat Pro/Team access as active only when paid is active.
  // Free can always use free limits.
  const paid = isPaidActive(ent.subscriptionStatus);
  if (ent.plan === 'team' && paid) {
    return { maxTeams: Number.POSITIVE_INFINITY, maxProcesses: Number.POSITIVE_INFINITY, canUseWebhooks: true };
  }
  if (ent.plan === 'pro' && paid) {
    return { maxTeams: 3, maxProcesses: 10, canUseWebhooks: false };
  }
  // Default: Free
  return { maxTeams: 1, maxProcesses: 2, canUseWebhooks: false };
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

