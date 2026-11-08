import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIPROC_PLANS } from '@/lib/billing-plans';
import { AI_PLAN_LIMITS } from '@/lib/ai/ai-plan-catalog';
import { ACTIPROC_FEATURE_TIERS, ACTIPROC_DEFAULT_SEAT_LIMITS, PLAN_MARKETING_FEATURES,
  planIncludesFeature, publishedPlanSnapshot } from '@/lib/plan-entitlement-matrix';
import { computePlanLimits } from '@/lib/plan-limits';
import { isCreemSubscriptionEligibleForEnvironment } from '@/lib/subscription-access';
import { canUsePaidFeature } from '@/lib/paid-feature-policy';
import type { Entitlements } from '@/lib/entitlements';
const plans=['free','individual','pro','team'] as const;
assert.equal(ACTIPROC_DEFAULT_SEAT_LIMITS.free,1);
assert.equal(ACTIPROC_DEFAULT_SEAT_LIMITS.individual,1);
const ent=(plan:typeof plans[number],status:Entitlements['subscriptionStatus']='active',
  endsAt:string|null=null):Pick<Entitlements,'plan'|'subscriptionStatus'|'endsAt'> =>
 ({plan,subscriptionStatus:status,endsAt});
for(const plan of plans){
  const snapshot=publishedPlanSnapshot(plan);
  assert.equal(snapshot.maxProcesses,ACTIPROC_PLANS[plan].maxProcesses);
  assert.equal(snapshot.maxTeams,ACTIPROC_PLANS[plan].maxTeams);
  assert.equal(snapshot.aiDailyPerUser,AI_PLAN_LIMITS[plan].dailyPerUser);
  assert.equal(snapshot.aiMonthlyBase,AI_PLAN_LIMITS[plan].monthlyBase);
  assert.ok(PLAN_MARKETING_FEATURES[plan].length>=4);
  const effective=computePlanLimits(ent(plan));
  assert.equal(effective.maxProcesses,ACTIPROC_PLANS[plan].maxProcesses);
  assert.equal(effective.maxTeams,ACTIPROC_PLANS[plan].maxTeams);
}
for(const [feature,tiers] of Object.entries(ACTIPROC_FEATURE_TIERS)){
  for(const plan of plans){
    assert.equal(planIncludesFeature(plan,feature as keyof typeof ACTIPROC_FEATURE_TIERS),
      tiers.includes(plan as never), 'Feature mismatch '+feature+' on '+plan);
  }
}
for(const plan of plans){
  for(const feature of ['google_calendar','advanced_reminders','webhooks'] as const)
    assert.equal(planIncludesFeature(plan,feature),canUsePaidFeature(ent(plan),feature));
}
for(const status of ['expired','past_due','paused'] as const){
  const limits=computePlanLimits(ent('team',status));
  assert.equal(limits.maxProcesses,1);
  assert.equal(limits.maxTeams,1);
  assert.equal(limits.canUseWebhooks,false);
}
const future=new Date(Date.now()+86400000).toISOString();
const past=new Date(Date.now()-86400000).toISOString();
assert.equal(computePlanLimits(ent('team','cancelled',future)).maxProcesses,Infinity);
assert.equal(computePlanLimits(ent('team','cancelled',past)).maxProcesses,1);
const creemTest={billing_provider:'creem',creem_subscription_id:'sub_test',creem_test_mode:true};
assert.equal(isCreemSubscriptionEligibleForEnvironment(creemTest,{VERCEL_ENV:'production'}),false);
assert.equal(isCreemSubscriptionEligibleForEnvironment(creemTest,{VERCEL_ENV:'preview'}),true);
assert.equal(isCreemSubscriptionEligibleForEnvironment(
 {billing_provider:'creem',creem_subscription_id:'sub_live',creem_test_mode:false},
 {VERCEL_ENV:'production'}),true);
assert.equal(isCreemSubscriptionEligibleForEnvironment(
 {billing_provider:'creem',creem_subscription_id:'sub_unknown',creem_test_mode:null},
 {VERCEL_ENV:'production'}),false);
assert.equal(isCreemSubscriptionEligibleForEnvironment(
 {billing_provider:null,creem_subscription_id:null,creem_test_mode:null},
 {VERCEL_ENV:'production'}),true);
const read=(path:string)=>readFileSync(path,'utf8');
const checks: Record<string,boolean>={
 'marketing catalog':read('components/marketing/sections/MarketingPricing.tsx').includes('PLAN_MARKETING_FEATURES.team'),
 'billing uses same catalog':read('components/billing/BillingClient.tsx').includes('PLAN_MARKETING_FEATURES.team'),
 'upgrade uses same catalog':read('components/billing/UpgradePlanModal.tsx').includes('PLAN_MARKETING_FEATURES.team'),
 'workspace paywall includes Pro':read('components/billing/UpgradePlanModal.tsx').includes("if (reason === 'teams') return ['pro', 'team'];"),
 'effective API limits':read('app/api/entitlements/capabilities/route.ts').includes('getPlanLimits(ent)'),
 'pure effective limit policy':read('lib/entitlements.ts').includes('return computePlanLimits(ent)'),
 'paid test isolation':read('lib/entitlements.ts').includes('liveProviderMismatch ?'),
 'process API':read('app/api/projects/route.ts').includes('getPlanLimits(ent)'),
 'workspace API':read('app/api/teams/route.ts').includes('getPlanLimits(ent)'),
 'webhook API':read('app/api/webhooks/route.ts').includes('limits.canUseWebhooks'),
 'webhook dispatch':read('lib/webhook-trigger.ts').includes('getPlanLimits(ent).canUseWebhooks'),
 'invite seats':read('app/api/invitations/route.ts').includes('ent.seatLimit'),
 'acceptance seats':read('app/api/onboarding/join-organization/route.ts').includes('acceptInvitationAtomic(') && read('lib/invitation-acceptance.ts').includes("rpc('accept_actiproc_invitation'"),
 'SQL read-only':read('scripts/sql/actiproc-entitlements-production-audit.sql').includes('BEGIN READ ONLY'),
 'DB serialization':read('supabase/migrations/20261108120000_actiproc_atomic_plan_limits.sql').includes('FOR NO KEY UPDATE'),
 'DB project cap':read('supabase/migrations/20261108120000_actiproc_atomic_plan_limits.sql').includes('BEFORE INSERT ON public.projects'),
 'DB workspace cap':read('supabase/migrations/20261108120000_actiproc_atomic_plan_limits.sql').includes('BEFORE INSERT ON public.teams'),
 'DB Creem Test guard':read('supabase/migrations/20261108120000_actiproc_atomic_plan_limits.sql').includes('billed_test_mode IS DISTINCT FROM FALSE'),
};
for(const [name,ok] of Object.entries(checks))assert.equal(ok,true,name);
console.log('Actiproc 4-plan / 14-feature catalog: '+Object.keys(checks).length+' source contracts passed.');
