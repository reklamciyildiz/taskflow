import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AI_TEMPORARY_CAPACITY_MESSAGE, AI_TEMPORARY_SERVICE_MESSAGE,
  configuredTokenBudget, mayFailOverBeforeResponse, safeAIErrorMessage,
  shortRetryDelayMs,
} from '../lib/ai/chat/reliability-policy';
import { GroqChatProvider } from '../lib/ai/providers/groq-chat-provider';

async function main() {
let checks=0;
for(const code of ['PROVIDER_RATE_LIMITED','PROVIDER_TOKEN_BUDGET','TEMPORARY_CAPACITY']) {
  assert.equal(safeAIErrorMessage(code,'Groq throttle 32s'),AI_TEMPORARY_CAPACITY_MESSAGE);
  checks++;
}
for(const code of ['PROVIDER_TIMEOUT','AI_UNAVAILABLE','PROVIDER_CONFIGURATION']) {
  assert.equal(safeAIErrorMessage(code),AI_TEMPORARY_SERVICE_MESSAGE);
  checks++;
}
assert.equal(safeAIErrorMessage('OTHER','The Groq request limit was reached. Try again in about 32 seconds.'),
  AI_TEMPORARY_CAPACITY_MESSAGE);
assert.equal(safeAIErrorMessage('OTHER','Actiproc AI is protecting the Groq minute limit. Try again in about 2 seconds.'),
  AI_TEMPORARY_CAPACITY_MESSAGE);
assert.equal(safeAIErrorMessage('QUOTA_EXHAUSTED','Daily allowance reached'),'Daily allowance reached');
checks+=3;

assert.equal(configuredTokenBudget(undefined,7_200,250_000),7_200);
assert.equal(configuredTokenBudget('250000',7_200,250_000),250_000);
assert.equal(configuredTokenBudget('8001',7_200,250_000),8_001);
for(const invalid of ['-1','0','bad','Infinity','999999999','2200.5','']) {
  assert.equal(configuredTokenBudget(invalid,7_200,250_000),7_200);
  checks++;
}
checks+=3;
assert.equal(shortRetryDelayMs(undefined),null);
assert.equal(shortRetryDelayMs(30_000),null);
assert.equal(shortRetryDelayMs(0),150);
assert.equal(shortRetryDelayMs(1_800),1_800);
assert.equal(shortRetryDelayMs(-1),null);
checks+=5;

assert.equal(mayFailOverBeforeResponse({code:'rate_limited',emittedText:false,aborted:false,
  fallbackAlreadyUsed:false,writeRequested:false}),true);
for(const overrides of [
  {code:'invalid_request'}, {emittedText:true},{aborted:true},{fallbackAlreadyUsed:true},{writeRequested:true},
]) {
  assert.equal(mayFailOverBeforeResponse({
    code:'rate_limited',emittedText:false,aborted:false,fallbackAlreadyUsed:false,writeRequested:false,
    ...overrides,
  }),false);
  checks++;
}
checks++;

let fallbackBody: Record<string,unknown>|undefined;
const fallback=new GroqChatProvider({
  providerId:'openai',apiKey:'synthetic-backup-only',model:'gpt-4.1-mini',
  endpoint:'https://api.openai.com/v1/chat/completions',
  supportsGroqReasoning:false,
  fetch:(async (_url,init)=>{
    fallbackBody=JSON.parse(String(init?.body));
    return new Response(JSON.stringify({model:'gpt-4.1-mini',choices:[{message:{content:'Response'}}],
      usage:{prompt_tokens:15,completion_tokens:6,total_tokens:21}}),{
        status:200,headers:{'Content-Type':'application/json'},
      });
  }) as typeof fetch,
});
const result=await fallback.complete({
  messages:[{role:'user',content:'A scoped synthetic message'}],
  maxOutputTokens:100,reasoning:{effort:'low',format:'hidden'},
}, {requestId:'synthetic-test',timeoutMs:5000});
assert.equal(result.text,'Response');
assert.equal(fallback.providerId,'openai');
assert.equal(fallbackBody?.model,'gpt-4.1-mini');
assert.equal('reasoning_effort' in (fallbackBody ?? {}),false);
assert.equal('reasoning_format' in (fallbackBody ?? {}),false);
checks+=5;

const route=readFileSync('app/api/ai/chat/route.ts','utf8');
const sql=readFileSync('supabase/migrations/20261104190000_ai_provider_zero_usage_finalization.sql','utf8');
const client=readFileSync('components/ai/AxiomAIChat.tsx','utf8');
const presentation=readFileSync('components/ai/AIChatPresentation.tsx','utf8');
const conversation=readFileSync('lib/ai/chat/conversation-server.ts','utf8');
const backupFactory=readFileSync('lib/ai/chat/backup-provider.ts','utf8');
assert.doesNotMatch(route,/protecting the Groq minute limit|The Groq request limit was reached/);
assert.match(route,/reserveProviderTokens/);
assert.match(route,/mayFailOverBeforeResponse/);
assert.match(route,/shortRetryDelayMs/);
assert.match(route,/emittedResponseText/);
assert.match(route,/writeRequested,/);
assert.match(route,/retryAssistantMessageId:z\.string\(\)\.uuid\(\)\.optional\(\)/);
assert.match(route,/claimFailedAssistantForRetry/);
assert.match(route,/sawStreamUsage\|\|definitelyNoNewProviderTokens/);
assert.match(backupFactory,/AI_FALLBACK_OPENAI_ENABLED !== 'true'/);
assert.match(backupFactory,/https:\/\/api\.openai\.com\/v1\/chat\/completions/);
assert.match(backupFactory,/if \(!process\.env\.AI_FALLBACK_TPM_BUDGET\) return null/);
assert.match(sql,/p_actual_tokens IS NOT NULL THEN p_actual_tokens/);
assert.match(sql,/WHERE id=p_reservation_id[\s\S]*AND status='reserved'/);
assert.match(conversation,/\.eq\('status','failed'\)\.select\('id'\)\.maybeSingle/);
assert.match(conversation,/allowedCodes=new Set/);
assert.match(conversation,/String\(user\.content\)!==originalQuestion/);
assert.match(client,/retryAssistantMessageId\?\?\`assistant-\$\{requestId\}\`/);
assert.match(presentation,/onRetry\(lastUser\.content,message\.id\)/);
checks+=19;
console.log(JSON.stringify({checks,networkCalls:0,migrationApplied:false,
  providerNeutralUI:true,inPlaceRetry:true,backupOptIn:true}));
}

void main().catch((error)=>{console.error(error);process.exitCode=1;});
