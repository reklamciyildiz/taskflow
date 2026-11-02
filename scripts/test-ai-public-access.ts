import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aiAllowanceForOrganization, estimateGroqChatCostUsd } from '../lib/ai/chat/plan-policy';
import { isAIBetaScopeAllowed } from '../lib/ai/beta-access';
import { formatAIQuotaMessage } from '../lib/ai/chat/quota-policy';

const entitlement = (plan: 'free'|'individual'|'pro'|'team',
  status: 'active'|'expired'|'trialing'|'past_due'|'cancelled' = 'active',
  seatLimit=1, endsAt: string | null=null) =>
  aiAllowanceForOrganization({ plan, subscriptionStatus: status, endsAt, seatLimit });
assert.deepEqual([entitlement('free').dailyRequestsPerUser, entitlement('free').monthlyRequestsPerOrg],[10,30]);
assert.deepEqual([entitlement('individual').dailyRequestsPerUser, entitlement('individual').monthlyRequestsPerOrg],[50,300]);
assert.deepEqual([entitlement('pro').dailyRequestsPerUser, entitlement('pro').monthlyRequestsPerOrg],[100,800]);
assert.deepEqual([entitlement('team','active',3).dailyRequestsPerUser, entitlement('team','active',3).monthlyRequestsPerOrg],[150,3600]);
assert.equal(entitlement('pro','active',3).monthlyRequestsPerOrg,2400, 'Pro seats must increase shared org quota');
assert.equal(entitlement('pro','active',100).monthlyRequestsPerOrg,16000, 'Pro AI quota also caps at 20 seats');
assert.equal(entitlement('individual','active',5).monthlyRequestsPerOrg,300, 'Individual does not multiply by seats');
assert.equal(entitlement('pro','active',0).monthlyRequestsPerOrg,800, 'Invalid seat quantities do not create unlimited AI');
assert.equal(entitlement('team','active',-5).monthlyRequestsPerOrg,1200, 'Invalid seat count gets single seat');
assert.equal(entitlement('team','active',100).monthlyRequestsPerOrg,24000,'Team cannot subsidize limitless seats');
assert.equal(entitlement('team','active',Infinity).monthlyRequestsPerOrg,1200,'Manually unlimited developer seat access is not unlimited AI');
assert.equal(entitlement('pro','past_due').monthlyRequestsPerOrg,30);
assert.equal(entitlement('team','expired',10).monthlyRequestsPerOrg,30);
assert.equal(entitlement('individual','trialing').monthlyRequestsPerOrg,300);
assert.equal(entitlement('team','cancelled',3,'2020-01-01T00:00:00Z').monthlyRequestsPerOrg,30);
assert.equal(entitlement('team','cancelled',3,'2099-01-01T00:00:00Z').monthlyRequestsPerOrg,3600);
assert.ok(formatAIQuotaMessage('Minute AI request rate limit exceeded',
  new Date('2026-11-02T20:00:00Z')).includes('Dakikada en fazla 12'),
  'Burst rejection should explain the limit and local reset time');
assert.equal(estimateGroqChatCostUsd('openai/gpt-oss-120b',4000,1000),0.0012);
assert.equal(estimateGroqChatCostUsd('qwen/qwen3.8-27b',4000,1000),0.0072);
assert.ok(estimateGroqChatCostUsd('unknown-model',4000,1000)>0,
  'Unknown models cannot silently be logged as zero-cost');
assert.equal(estimateGroqChatCostUsd('openai/gpt-oss-120b',0,0),0);

const minutePolicy=fs.readFileSync('supabase/migrations/20261102210000_ai_public_fair_use_burst_guard.sql','utf8');
assert.ok(minutePolicy.includes("IF p_feature = 'axiom-chat'") &&
 minutePolicy.includes('v_minute_count >= 12') &&
 minutePolicy.includes("created_at > now() - interval '60 seconds'") &&
 minutePolicy.includes("pg_advisory_xact_lock(hashtextextended('ai-quota:user:'") &&
 minutePolicy.includes('CREATE OR REPLACE FUNCTION public.reserve_ai_quota('),
 'Atomic minute burst cap must be checked under existing quota locks');
const burstLockAt=minutePolicy.indexOf("pg_advisory_xact_lock(hashtextextended('ai-quota:user:'");
const burstCheckAt=minutePolicy.indexOf('v_minute_count >= 12');
const firstReservationAt=minutePolicy.indexOf('INSERT INTO public.ai_quota_counters');
assert.ok(burstLockAt >= 0 && burstLockAt < burstCheckAt &&
 burstCheckAt < firstReservationAt, 'Minute burst limit must be atomic and checked before incrementing counters');
assert.ok(minutePolicy.includes("IF v_reservation_id IS NOT NULL THEN") &&
 minutePolicy.indexOf('IF v_reservation_id IS NOT NULL THEN') < burstCheckAt,
 'Idempotent existing requests must not be double-charged against minute caps');
assert.ok(minutePolicy.includes('ai_public_burst_guard_ready()') &&
 !minutePolicy.includes('DROP TABLE') && !minutePolicy.includes('TRUNCATE'),
 'Guard migration must be discoverable and data-preserving');
const server=fs.readFileSync('lib/ai/chat/http-server.ts','utf8');
const chat=fs.readFileSync('app/api/ai/chat/route.ts','utf8');
const quota=fs.readFileSync('lib/ai/utils/rate-limiter.ts','utf8');
const usage=fs.readFileSync('app/api/ai/usage/route.ts','utf8');
const view=fs.readFileSync('components/ai/AxiomAIChat.tsx','utf8');
const ui=fs.readFileSync('components/ai/AIAllowanceIndicator.tsx','utf8');
assert.ok(server.includes("supabaseAdmin.rpc('ai_public_burst_guard_ready')") &&
 server.includes('PUBLIC_RATE_GUARD_NOT_READY'),
 'Public access must refuse operation until the database burst guard is installed');
assert.ok(server.includes('isAIBetaScopeAllowed(') && server.includes('!isAIBetaModeEnabled()') &&
 server.includes("process.env.AI_GROQ_TPM_ADMISSION_ENABLED !== 'true'") &&
 server.includes("process.env.AXIOM_AI_WRITE_TOOLS_ENABLED === 'true'"),
 'Public release must retain the beta guard and fail closed without hard provider admission / write tools off');
assert.ok(chat.includes('aiAllowanceForAuthenticatedOrganization(scope.organizationId)') &&
 chat.includes('dailyRequestsPerUser:allowance.dailyRequestsPerUser') &&
 chat.includes('monthlyRequestsPerOrg:allowance.monthlyRequestsPerOrg') &&
 chat.includes('estimateGroqChatCostUsd('),
 'Every provider chat must use server-verified plan quotas and account for token costs');
assert.ok(quota.includes('return planLimits ? quotaBackendFailureDecision()') &&
 quota.includes('p_daily_user_limit: effectiveLimits.dailyRequestsPerUser') &&
 quota.includes('p_monthly_org_limit: effectiveLimits.monthlyRequestsPerOrg'),
 'No non-atomic or client-authorized public quota fallback');
assert.ok(usage.includes("from('ai_quota_counters')") &&
 usage.includes("eq('scope_type', 'user_day')") &&
 usage.includes("eq('scope_type', 'organization_month')") &&
 usage.includes("'Cache-Control': 'private, no-store'"),
 'Quota UI must show the same private atomic counters that enforce consumption');
assert.ok(view.includes('const createdPayload=await created.json()') &&
 !view.includes('activeConversation=(await created.json())') &&
 view.includes('<AIAllowanceIndicator'),
 'New conversation must read its response exactly once and show plan usage');
assert.ok(ui.includes('Daily AI limit reached') && ui.includes('Monthly AI limit reached') &&
 ui.includes('role="progressbar"') && ui.includes('status.daily.remaining'),
 'AI usage UI must distinguish daily and monthly exhaustion, including mobile');
assert.ok(ui.includes('AI requests left this month') && ui.includes('href="/settings/billing"') &&
 !ui.includes('next/link'),'Allowance UI must remain compatible with Capacitor');
const saved=process.env.AXIOM_AI_BETA_MODE_ENABLED;
try {
 process.env.AXIOM_AI_BETA_MODE_ENABLED='false';
 assert.equal(isAIBetaScopeAllowed('new-user','new-org'),true,
  'Public mode must release legacy allowlists, protected by the HTTP rollout guard');
} finally {
 if(saved===undefined) delete process.env.AXIOM_AI_BETA_MODE_ENABLED;
 else process.env.AXIOM_AI_BETA_MODE_ENABLED=saved;
}
console.log('PASS: generous plan allowances, verified paid seats, minute burst guard, beta safety, token telemetry and mobile AI usage UI');
