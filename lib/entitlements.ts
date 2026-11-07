import { organizationDb, teamMemberDb } from '@/lib/db';
import { isPaidActive, isCreemSubscriptionEligibleForEnvironment, type SubscriptionStatus } from '@/lib/subscription-access';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { canUsePaidFeature } from '@/lib/paid-feature-policy';
import { computePlanLimits } from '@/lib/plan-limits';

export { isPaidActive } from '@/lib/subscription-access';
export type { SubscriptionStatus } from '@/lib/subscription-access';

export type PlanName = 'free' | 'individual' | 'pro' | 'team';

export type OrganizationBilling = {
  id: string;
  plan_name: PlanName | string | null;
  subscription_status: SubscriptionStatus | string | null;
  variant_id: string | null;
  ls_customer_id: string | null;
  ls_subscription_id: string | null;
  creem_subscription_id?: string | null;
  billing_provider?: string | null;
  seat_limit?: number | null;
  subscription_ends_at?: string | null;
};

export type Entitlements = {
  plan: PlanName;
  subscriptionStatus: SubscriptionStatus;
  /** Maximum allowed seats for this organization (used for invites / access caps). */
  seatLimit: number;
  endsAt: string | null;
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
  if (p === 'individual') return 'individual';
  return 'free';
}

function normalizeStatus(status: unknown): SubscriptionStatus {
  const s = String(status ?? 'active').trim().toLowerCase();
  if (s === 'cancelled') return 'cancelled';
  if (s === 'paused') return 'paused';
  if (s === 'expired') return 'expired';
  if (s === 'past_due') return 'past_due';
  if (s === 'trialing') return 'trialing';
  return s === 'active' ? 'active' : 'expired'; // Unknown billing states fail closed.
}

/** Default seat caps when org row has no stored `seat_limit` (e.g. legacy rows). Paid caps normally come from payment webhooks. */
export function getSeatLimitFromPlan(plan: PlanName): number {
  if (plan === 'free') return 2;
  if (plan === 'individual') return 1;
  if (plan === 'pro') return 1;
  if (plan === 'team') return Number.POSITIVE_INFINITY;
  return 2;
}

export function canUseAdvancedReminders(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus' | 'endsAt'>): boolean {
  return canUsePaidFeature(ent, 'advanced_reminders');
}

export function canInviteMembers(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus'>): boolean {
  // seatLimit is the hard cap for all plans and statuses.
  // Cancelled paid plans fall back to free-tier seatLimit (=2); still allow inviting up to that cap.
  return true;
}

export function getPlanLimits(ent: Pick<Entitlements, 'plan' | 'subscriptionStatus' | 'endsAt'>): PlanLimits {
  return computePlanLimits(ent);
}

export async function getOrganizationEntitlements(organizationId: string): Promise<Entitlements> {
  const org: any = await organizationDb.getById(organizationId);
  const liveProviderMismatch = !isCreemSubscriptionEligibleForEnvironment(org ?? {});
  let plan = liveProviderMismatch ? 'free' : normalizePlan(org?.plan_name);
  // Provider may switch plan before completing an immediate charge. Keep the
  // previously paid plan until the new invoice is VERIFIED and lease settled.
  if(process.env.CREEM_PLAN_MUTATIONS_ENABLED==='true' &&
     org?.billing_provider==='creem' && org.creem_subscription_id) {
    const {data:pending,error}=await (supabaseAdmin as any).from('creem_plan_changes')
      .select('previous_plan,desired_plan').eq('organization_id',organizationId)
      .in('status',['pending','awaiting_sync','review']).maybeSingle();
    if(error) {
      console.error('[creem] cannot verify pending plan change',{code:error.code});
      plan='free'; // fail closed — never grant unverified Team features
    }else if(pending && pending.desired_plan===plan){
      plan=normalizePlan(pending.previous_plan);
    }
  }
  // Creem payment holds and failed/paused subscriptions never unlock paid access.
  // A pending provider plan change must not override Production Test Mode isolation.
  if (liveProviderMismatch) plan = 'free';
  const subscriptionStatus = liveProviderMismatch ||
    (org?.billing_provider === 'creem' &&
      (org?.creem_payment_hold || ['past_due', 'paused'].includes(String(org?.subscription_status))))
      ? 'expired' : normalizeStatus(org?.subscription_status);
  const endsAt = org?.subscription_ends_at ? String(org.subscription_ends_at) : null;
  const paid = isPaidActive(subscriptionStatus, endsAt);
  const stored = Number(org?.seat_limit);
  const storedOk = Number.isFinite(stored) && stored > 0;

  const hasRealSubscription = !!(org?.ls_subscription_id || org?.creem_subscription_id);

  let seatLimit: number;
  if (plan === 'free') {
    seatLimit = getSeatLimitFromPlan('free');
  } else if (!paid) {
    // Cancelled / inactive paid plan: align invite caps with Free until they resubscribe.
    seatLimit = getSeatLimitFromPlan('free');
  } else if (plan === 'team') {
    // No active paid subscription = manually upgraded (developer / owner account): treat as unlimited.
    // A missing seat quantity on a real subscription must never mean unlimited paid seats.
    seatLimit = hasRealSubscription ? (storedOk ? Math.floor(stored) : 1) : Number.POSITIVE_INFINITY;
  } else if (plan === 'individual') {
    seatLimit = 1;
  } else if (plan === 'pro') {
    seatLimit = storedOk ? Math.max(1, Math.floor(stored)) : getSeatLimitFromPlan('pro');
  } else {
    seatLimit = getSeatLimitFromPlan('free');
  }

  if (process.env.CREEM_SEAT_MUTATIONS_ENABLED==='true' &&
      org?.billing_provider==='creem' && org.creem_subscription_id &&
      (plan==='pro'||plan==='team') && paid) {
    // Provider may update units before completing the payment. Keep the
    // *previous purchased cap* until payment confirmation closes the lease.
    const {data:open,error}=await (supabaseAdmin as any).from('creem_seat_changes')
      .select('previous_seats,desired_seats')
      .eq('organization_id',organizationId)
      .in('status',['pending','awaiting_sync','review']).maybeSingle();
    if(error) {
      console.error('[creem] could not verify active seat mutation',{code:error.code});
      seatLimit=Math.min(seatLimit,1); // fail closed, never grant unverified seats
    } else if(open && Number(open.desired_seats)>Number(open.previous_seats)) {
      seatLimit=Math.min(seatLimit,Math.max(1,Number(open.previous_seats)));
    }
  }
  return { plan, subscriptionStatus, seatLimit, endsAt };
}

export async function getOrganizationSeatUsage(organizationId: string): Promise<number> {
  const users: any[] = await teamMemberDb.listDistinctUsersForOrganization(organizationId);
  return Array.isArray(users) ? users.length : 0;
}

