import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aiAllowanceForOrganization } from '../lib/ai/chat/plan-policy';
import { AI_PLAN_LIMITS, AI_MAX_FUNDED_SEATS, AI_BURST_REQUESTS_PER_MINUTE,
 aiPlanDailyDescription, aiPlanMonthlyDescription, aiPlanMonthlyLimit, aiUsageThreshold } from '../lib/ai/ai-plan-catalog';
import type { AIPlanKey } from '../lib/ai/ai-plan-catalog';

const expected = {
 free: [10,30],
 individual: [50,300],
 pro: [100,800],
 team: [150,1200],
} as const;

for (const plan of Object.keys(expected) as AIPlanKey[]) {
 const [daily, monthly] = expected[plan];
 assert.equal(AI_PLAN_LIMITS[plan].dailyPerUser,daily);
 assert.equal(AI_PLAN_LIMITS[plan].monthlyBase,monthly);
 assert.ok(aiPlanMonthlyDescription(plan).includes(monthly.toLocaleString('en-US')));
 assert.ok(aiPlanDailyDescription(plan).includes(String(daily)));
 const ent = aiAllowanceForOrganization({
  plan, subscriptionStatus:'active', endsAt:null, seatLimit:3,
 });
 assert.equal(ent.dailyRequestsPerUser,daily);
 assert.equal(ent.monthlyRequestsPerOrg,plan==='pro'||plan==='team'?monthly*3:monthly);
 assert.equal(ent.includedSeats,plan==='pro'||plan==='team'?3:1);
}
assert.equal(AI_MAX_FUNDED_SEATS,20);
assert.equal(AI_BURST_REQUESTS_PER_MINUTE,12);
assert.equal(aiPlanMonthlyLimit('team',20),24000);
assert.equal(aiPlanMonthlyLimit('team',21),24000,'No implied additional AI for seat 21');
assert.equal(aiPlanMonthlyLimit('pro',Infinity),800,'Unlimited admin seat entitlements do not create unlimited AI');
assert.equal(aiPlanMonthlyLimit('individual',20),300,'Individual does not scale per seat');
assert.equal(aiUsageThreshold(0,300),'normal');
assert.equal(aiUsageThreshold(239,300),'normal');
assert.equal(aiUsageThreshold(240,300),'warning');
assert.equal(aiUsageThreshold(299,300),'warning');
assert.equal(aiUsageThreshold(300,300),'exhausted');
assert.equal(aiUsageThreshold(999,300),'exhausted');
assert.equal(aiUsageThreshold(0,0),'exhausted');

const pricing=fs.readFileSync('components/marketing/sections/MarketingPricing.tsx','utf8');
const upgrade=fs.readFileSync('components/billing/UpgradePlanModal.tsx','utf8');
const billing=fs.readFileSync('components/billing/BillingClient.tsx','utf8');
const billAI=fs.readFileSync('components/billing/AIUsageBillingCard.tsx','utf8');
const indicator=fs.readFileSync('components/ai/AIAllowanceIndicator.tsx','utf8');
const usage=fs.readFileSync('app/api/ai/usage/route.ts','utf8');
const hook=fs.readFileSync('components/ai/useAIUsage.ts','utf8');
const policy=fs.readFileSync('lib/ai/chat/plan-policy.ts','utf8');

for(const [name,src] of [['MarketingPricing',pricing],['UpgradePlanModal',upgrade],
 ['BillingClient',billing]]) {
 assert.ok(src.includes('ai-plan-catalog') || src.includes('aiPlanMonthlyDescription'),
  name+' must share the verified single-source AI catalog');
}
assert.ok(pricing.includes('AI access: staged beta rollout') &&
 pricing.includes('Per paid seat · shared organization pool') &&
 pricing.includes('no automatic overage')===false &&
 pricing.includes('No automatic overage charges'),
 'Marketing pricing must accurately describe beta, fair use and no overages');
assert.ok(upgrade.includes('AI_PLAN_LIMITS[p].monthlyBase') &&
 upgrade.includes('AI may remain beta-only') &&
 upgrade.includes('isNativeApp') && upgrade.includes("Purchases and plan upgrades are unavailable"),
 'Upgrade plans must show AI fair use but retain Capacitor purchase gate');
assert.ok(billing.includes('<AIUsageBillingCard') &&
 billing.includes('id="billing-plans"') &&
 billing.includes('aiPlanMonthlyDescription(key)'),
 'Billing must show verified usage and clear plan upgrade comparison');
assert.ok(billAI.includes('useAIUsage(fetch)') &&
 billAI.includes("status.access === 'beta_only'") &&
 billAI.includes("monthState === 'exhausted'") &&
 billAI.includes("role=\"progressbar\"") &&
 billAI.includes("no automatic overages")===false,
 'Billing usage must render real plan, access status, progress and exhaustion');
assert.ok(billAI.includes('No automatic usage overages or charges') &&
 billAI.includes("nearLimit") && billAI.includes("'warning'") &&
 billAI.includes("isCapacitorNative()"),
 'Billing must warn at 80% and avoid native paid checkout links');
assert.ok(indicator.includes("useAIUsage(request, refreshKey)") &&
 indicator.includes('Monthly AI limit reached') &&
 indicator.includes('Daily AI limit reached') &&
 indicator.includes("status.access === 'beta_only'"),
 'AI Chat must show current validated daily/monthly usage and rollout access');
assert.ok(usage.includes('requireAuthedUser(request)') &&
 !usage.includes('await requireAIChatUser(request)') &&
 usage.includes('aiAllowanceForAuthenticatedOrganization(organizationId)') &&
 usage.includes("ai_quota_counters") &&
 usage.includes("'Cache-Control': 'private, no-store'") &&
 usage.includes('ai_public_burst_guard_ready') &&
 usage.includes("AI_GROQ_TPM_ADMISSION_ENABLED") &&
 usage.includes("'beta_only'"),
 'Quota read must allow authenticated beta-ineligible users, preserve org ACL, and fail closed');
assert.ok(hook.includes("if (!isAIUsageStatus(data))") &&
 hook.includes('setStatus(null)') && hook.includes("cache: 'no-store'"),
 'UI must not show stale or malformed allowance data');
assert.ok(policy.includes('AI_PLAN_LIMITS[plan]') &&
 policy.includes('aiPlanMonthlyLimit(plan, seats)'),
 'Actual enforcement must share public metadata with marketing, upgrade and billing');
console.log('PASS: 4 tiers, per-seat scaling, 80% thresholds, private usage auth, beta disclosures, billing and mobile purchase safety');
