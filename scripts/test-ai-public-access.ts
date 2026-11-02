import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aiAllowanceForOrganization, estimateGroqChatCostUsd } from '../lib/ai/chat/plan-policy';
import { isAIBetaScopeAllowed } from '../lib/ai/beta-access';

const entitlement = (plan: 'free'|'individual'|'pro'|'team',
  status: 'active'|'expired'|'trialing'|'past_due'|'cancelled' = 'active',
  seatLimit=1, endsAt: string | null=null) =>
  aiAllowanceForOrganization({ plan, subscriptionStatus: status, endsAt, seatLimit });
assert.deepEqual([entitlement('free').dailyRequestsPerUser, entitlement('free').monthlyRequestsPerOrg],[2,5]);
assert.deepEqual([entitlement('individual').dailyRequestsPerUser, entitlement('individual').monthlyRequestsPerOrg],[5,20]);
assert.deepEqual([entitlement('pro').dailyRequestsPerUser, entitlement('pro').monthlyRequestsPerOrg],[15,100]);
assert.deepEqual([entitlement('team','active',3).dailyRequestsPerUser, entitlement('team','active',3).monthlyRequestsPerOrg],[20,360]);
assert.equal(entitlement('team','active',100).monthlyRequestsPerOrg,2400,'Team cannot subsidize limitless seats');
assert.equal(entitlement('team','active',Infinity).monthlyRequestsPerOrg,120,'Manually unlimited developer seat access is not unlimited AI');
assert.equal(entitlement('pro','past_due').monthlyRequestsPerOrg,5);
assert.equal(entitlement('team','expired',10).monthlyRequestsPerOrg,5);
assert.equal(entitlement('individual','trialing').monthlyRequestsPerOrg,20);
assert.equal(entitlement('team','cancelled',3,'2020-01-01T00:00:00Z').monthlyRequestsPerOrg,5);
assert.equal(entitlement('team','cancelled',3,'2099-01-01T00:00:00Z').monthlyRequestsPerOrg,360);
assert.equal(estimateGroqChatCostUsd('openai/gpt-oss-120b',4000,1000),0.0012);
assert.equal(estimateGroqChatCostUsd('qwen/qwen3.8-27b',4000,1000),0.0072);
assert.ok(estimateGroqChatCostUsd('unknown-model',4000,1000)>0,
  'Unknown models cannot silently be logged as zero-cost');
assert.equal(estimateGroqChatCostUsd('openai/gpt-oss-120b',0,0),0);

const server=fs.readFileSync('lib/ai/chat/http-server.ts','utf8');
const chat=fs.readFileSync('app/api/ai/chat/route.ts','utf8');
const quota=fs.readFileSync('lib/ai/utils/rate-limiter.ts','utf8');
const usage=fs.readFileSync('app/api/ai/usage/route.ts','utf8');
const view=fs.readFileSync('components/ai/AxiomAIChat.tsx','utf8');
const ui=fs.readFileSync('components/ai/AIAllowanceIndicator.tsx','utf8');
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
console.log('PASS: free/paid quotas, billing downgrades, team seats, beta/public gating, token-cost estimates, shared AI UI');
