import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelRoutingBucket,selectChatModel,isSupportedRoutedModel } from '../lib/ai/chat/model-router';
import { providerCapacityPolicy,configuredRequestBudget,admissionRetryDelayMs } from '../lib/ai/chat/provider-capacity-policy';

const org='11111111-1111-4111-8111-111111111111';
const defaults={
  intent:'general' as const,question:'Hello, how can I plan today?',
  profile:'general' as const,organizationId:org,writeRequested:false,
  configuredMaxOutputTokens:1000,
};
const enabled={
  AI_MODEL_ROUTING_ENABLED:'true',
  AI_PROVIDER_ADMISSION_V2_ENABLED:'true',
  AI_MODEL_ROUTING_ROLLOUT_PERCENT:'100',
  GROQ_CHAT_MODEL:'qwen/qwen3.8-27b',
};
const legacy=selectChatModel({...defaults,env:{...enabled,AI_MODEL_ROUTING_ENABLED:'false'}});
assert.equal(legacy.model,'qwen/qwen3.8-27b');
assert.equal(legacy.routed,false);
assert.equal(legacy.maxOutputTokens,1000);
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_PROVIDER_ADMISSION_V2_ENABLED:'false'}}).routed,false,
  'Never enable cross-model routing before atomic V2 admission');
const write=selectChatModel({...defaults,writeRequested:true,env:enabled});
assert.equal(write.routed,false);
assert.equal(write.reason,'write_pinned');
const general=selectChatModel({...defaults,env:enabled});
assert.equal(general.model,'openai/gpt-oss-120b');
assert.equal(general.route,'general');
assert.equal(general.maxOutputTokens,600);
const deep=selectChatModel({...defaults,question:'YHT ve TLSuite notlarımdan ne gibi çıkarımlar yapabilirim?',env:enabled});
assert.equal(deep.model,'qwen/qwen3.8-27b');
assert.equal(deep.route,'deep');
assert.equal(deep.maxOutputTokens,1000);
const cited=selectChatModel({...defaults,intent:'knowledge',profile:'rag_narrow',env:enabled});
assert.equal(cited.model,'qwen/qwen3.8-27b');
const analysis=selectChatModel({...defaults,question:'Compare my projects and recommend priorities',env:enabled});
assert.equal(analysis.route,'deep');
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_MODEL_GENERAL:'non-existent-model'}}).model,'openai/gpt-oss-120b',
  'Never let env typos silently select unknown provider model');
assert.equal(isSupportedRoutedModel('openai/gpt-oss-20b'),true);
assert.equal(isSupportedRoutedModel('other/random'),false);
assert.equal(modelRoutingBucket(org),modelRoutingBucket(org));
assert.ok(modelRoutingBucket(org)>=0 && modelRoutingBucket(org)<100);
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_MODEL_ROUTING_ROLLOUT_PERCENT:'0'}}).routed,false);
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_MODEL_ROUTING_ROLLOUT_PERCENT:'100'}}).routed,true);
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_MODEL_ROUTING_ROLLOUT_PERCENT:'-1'}}).routed,false);
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_MODEL_ROUTING_ROLLOUT_PERCENT:'101'}}).routed,false);
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_MODEL_ROUTING_ROLLOUT_PERCENT:'5.5'}}).routed,false);
assert.equal(selectChatModel({...defaults,env:{...enabled,AI_MODEL_GENERAL:'openai/gpt-oss-20b'}}).model,'openai/gpt-oss-20b');

const capacities=providerCapacityPolicy({provider:'groq',modelTokenLimit:7200,env:{}});
assert.deepEqual(capacities,{
  modelTokenLimit:7200,providerTokenLimit:7200,
  modelRequestLimit:24,providerRequestLimit:24,
});
const paid=providerCapacityPolicy({provider:'groq',modelTokenLimit:100_000,
  env:{AI_GROQ_ACCOUNT_TPM_BUDGET:'120000',AI_GROQ_MODEL_RPM_BUDGET:'500',AI_GROQ_ACCOUNT_RPM_BUDGET:'700'}});
assert.equal(paid.providerTokenLimit,120_000);
assert.equal(paid.modelRequestLimit,500);
assert.equal(paid.providerRequestLimit,700);
const backup=providerCapacityPolicy({provider:'openai',modelTokenLimit:7200,env:{}});
assert.equal(backup.providerRequestLimit,20);
assert.equal(backup.providerTokenLimit,7200);
assert.equal(configuredRequestBudget('not-a-number',24),24);
assert.equal(configuredRequestBudget('0',24),24);
assert.equal(configuredRequestBudget('10001',24),24);
assert.equal(configuredRequestBudget('1000',24),1000);

const retryCase={allowed:false,reason:'capacity',retryAfterSeconds:1,
  enabled:true,timeRemainingMs:15000};
assert.equal(admissionRetryDelayMs(retryCase),1000);
assert.equal(admissionRetryDelayMs({...retryCase,retryAfterSeconds:2}),null);
assert.equal(admissionRetryDelayMs({...retryCase,timeRemainingMs:5000}),null);
assert.equal(admissionRetryDelayMs({...retryCase,reason:'oversized'}),null);
assert.equal(admissionRetryDelayMs({...retryCase,enabled:false}),null);
assert.equal(admissionRetryDelayMs({...retryCase,allowed:true}),null);

const source=(file:string)=>readFileSync(file,'utf8');
const route=source('app/api/ai/chat/route.ts');
assert.match(route,/selectChatModel\(/);
assert.match(route,/provider=new GroqChatProvider\(\{model:decision.model\}\)/);
assert.match(route,/reserveGroqTokens\(admissionArgs\)/);
assert.match(route,/Math.min\(finalContextPlan.maxOutputTokens,decision.maxOutputTokens\)/);
assert.match(route,/admissionRetryDelayMs/);
assert.match(route,/mayFailOverBeforeResponse/);
assert.match(route,/!writeRequested \? createOptionalOpenAIBackup\(\)/);
assert.match(route,/modelRoute:decision.route/);
assert.match(route,/releaseAIQuotaReservation/);
const admission=source('lib/ai/chat/provider-token-admission.ts');
assert.match(admission,/AI_PROVIDER_ADMISSION_V2_ENABLED==='true'/);
assert.match(admission,/reserve_ai_provider_tokens_v2/);
assert.match(admission,/reserve_ai_provider_tokens',/);
assert.match(admission,/providerCapacityPolicy/);
assert.match(admission,/groqTokenBudget\(input.model\)/);
const migration=source('supabase/migrations/20261112183000_ai_provider_capacity_v2.sql');
assert.match(migration,/pg_advisory_xact_lock/);
assert.match(migration,/p_provider_request_limit/);
assert.match(migration,/v_provider_tokens\+p_requested_tokens/);
assert.match(migration,/NOT EXISTS \(/);
assert.match(migration,/REVOKE ALL ON FUNCTION/);
assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM/);
console.log(JSON.stringify({
  suite:'ai-architecture-v2',status:'passed',modelCanary:true,failClosed:true,
  shortWaitBounded:true,liveProviderCalls:false,liveDatabaseCalls:false,
}));
