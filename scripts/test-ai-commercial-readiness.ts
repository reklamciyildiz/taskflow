import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiAllowanceForOrganization } from '@/lib/ai/chat/plan-policy';
import { isAIBetaModeEnabled, isAIBetaScopeAllowed } from '@/lib/ai/beta-access';
import { isAIChatRuntimeReady } from '@/lib/ai/chat/config';
import type { Entitlements } from '@/lib/entitlements';
const read=(p:string)=>readFileSync(p,'utf8');
type S=Entitlements['subscriptionStatus'];
const plan=(p:Entitlements['plan'],s:S='active',n=1,e:string|null=null)=>aiAllowanceForOrganization({plan:p,subscriptionStatus:s,seatLimit:n,endsAt:e});
assert.deepEqual([plan('free').dailyRequestsPerUser,plan('free').monthlyRequestsPerOrg],[10,30]);
assert.deepEqual([plan('individual').dailyRequestsPerUser,plan('individual').monthlyRequestsPerOrg],[50,300]);
assert.deepEqual([plan('pro').dailyRequestsPerUser,plan('pro').monthlyRequestsPerOrg],[100,800]);
assert.deepEqual([plan('team').dailyRequestsPerUser,plan('team').monthlyRequestsPerOrg],[150,1200]);
assert.equal(plan('pro','active',3).monthlyRequestsPerOrg,2400);
assert.equal(plan('team','active',5).monthlyRequestsPerOrg,6000);
assert.equal(plan('team','active',25).monthlyRequestsPerOrg,24000);
assert.equal(plan('pro','past_due',5).monthlyRequestsPerOrg,30);
assert.equal(plan('team','expired',5).dailyRequestsPerUser,10);
assert.equal(plan('individual','cancelled',1,'2020-01-01T00:00:00Z').monthlyRequestsPerOrg,30);
const envs=['AXIOM_AI_CHAT_ENABLED','AI_ATOMIC_QUOTA_ENABLED','GROQ_API_KEY','AXIOM_AI_BETA_MODE_ENABLED'];
const saved=Object.fromEntries(envs.map(name=>[name,process.env[name]]));
try {
 delete process.env.AXIOM_AI_CHAT_ENABLED;
 delete process.env.AI_ATOMIC_QUOTA_ENABLED;
 delete process.env.GROQ_API_KEY;
 assert.equal(isAIChatRuntimeReady(),false);
 process.env.AXIOM_AI_CHAT_ENABLED='true';
 process.env.AI_ATOMIC_QUOTA_ENABLED='true';
 process.env.GROQ_API_KEY='synthetic-test';
 assert.equal(isAIChatRuntimeReady(),true);
 delete process.env.AXIOM_AI_BETA_MODE_ENABLED;
 assert.equal(isAIBetaModeEnabled(),true);
 assert.equal(isAIBetaScopeAllowed('ordinary','organization'),false);
} finally {
 for(const name of envs) saved[name]===undefined?delete process.env[name]:(process.env[name]=saved[name]);
}
const route=read('app/api/ai/description-generator/route.ts');
const gen=read('lib/ai/services/description-generator.ts');
const usage=read('app/api/ai/usage/route.ts');
const chat=read('app/api/ai/chat/route.ts');
const auth=read('lib/ai/chat/http-server.ts');
const tests:Record<string,boolean>={
 'Legacy feature uses chat beta/public guard':route.includes('requireAIChatUser(request)'),
 'Server-derived organization':route.includes('organizationId: scope.organizationId'),
 'Server-derived user':route.includes('userId: scope.userId'),
 'Provider quota uses verified plan':gen.includes('aiAllowanceForAuthenticatedOrganization(request.organizationId)'),
 'Daily plan limit':gen.includes('dailyRequestsPerUser: allowance.dailyRequestsPerUser'),
 'Paid-seat org pool':gen.includes('monthlyRequestsPerOrg: allowance.monthlyRequestsPerOrg'),
 'Atomic quota used':gen.includes('reserveAIQuota(')&&gen.includes('quotaRequestKey,'),
 'Token admission precedes external provider request':gen.indexOf('reserveProviderTokens({')<gen.indexOf('await generateCompletion('),
 'Provider admission must return reservation ID':gen.includes('!admission.allowed || !admission.reservationId'),
 'Provider refusal refunds user quota':gen.includes('await releaseAIQuotaReservation(quotaRequestKey,'),
 'Provider tokens finalized':gen.includes('await finalizeGroqTokens({'),
 'Untrusted provider errors not exposed':!route.includes('details: error instanceof Error'),
 'Usage not_ready if admission disabled':usage.includes("process.env.AI_GROQ_TPM_ADMISSION_ENABLED !== 'true'"),
 'Usage no-store':usage.includes("'Cache-Control': 'private, no-store'"),
 'Public write safeguards':auth.includes("process.env.AXIOM_AI_WRITE_TOOLS_ENABLED === 'true'"),
 'Chat derives plan from server':chat.includes('aiAllowanceForAuthenticatedOrganization(scope.organizationId)'),
};
for(const [name,ok] of Object.entries(tests))assert.ok(ok,'M5 contract failed: '+name);
console.log(JSON.stringify({checks:Object.keys(tests).length+13,liveCalls:false,providerCharges:false}));
