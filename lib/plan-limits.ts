import { ACTIPROC_PLANS } from './billing-plans';
import { isPaidActive } from './subscription-access';
import { canUsePaidFeature } from './paid-feature-policy';
import type { Entitlements, PlanLimits } from './entitlements';

/** Pure, testable effective capacity policy. No Supabase client side effects. */
export function computePlanLimits(
  ent: Pick<Entitlements, 'plan' | 'subscriptionStatus' | 'endsAt'>
): PlanLimits {
  const paid = isPaidActive(ent.subscriptionStatus, ent.endsAt);
  if (ent.plan === 'team' && paid) {
    return {
      maxTeams: ACTIPROC_PLANS.team.maxTeams,
      maxProcesses: ACTIPROC_PLANS.team.maxProcesses,
      canUseWebhooks: canUsePaidFeature(ent, 'webhooks'),
    };
  }
  if (ent.plan === 'pro' && paid) {
    return { maxTeams: ACTIPROC_PLANS.pro.maxTeams,
      maxProcesses: ACTIPROC_PLANS.pro.maxProcesses, canUseWebhooks: false };
  }
  if (ent.plan === 'individual' && paid) {
    return { maxTeams: ACTIPROC_PLANS.individual.maxTeams,
      maxProcesses: ACTIPROC_PLANS.individual.maxProcesses, canUseWebhooks: false };
  }
  return { maxTeams: ACTIPROC_PLANS.free.maxTeams,
    maxProcesses: ACTIPROC_PLANS.free.maxProcesses, canUseWebhooks: false };
}
