import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GroqChatProvider } from '../lib/ai/providers/groq-chat-provider';
import { groqReasoningBodyOptions, readToolSelectorMaxOutputTokens } from '../lib/ai/providers/model-reasoning-compat';
import { classifyChatIntent } from '../lib/ai/chat/intent';
import { selectChatModel } from '../lib/ai/chat/model-router';
import { planDirectAIReadTools, shouldUseModelToolSelection } from '../lib/ai/agent/router';

async function main(){
const qwen={providerId:'groq' as const,modelId:'qwen/qwen3.8-27b',supportsGroqReasoning:true};
const gpt={providerId:'groq' as const,modelId:'openai/gpt-oss-120b',supportsGroqReasoning:true};
const gpt20={...gpt,modelId:'openai/gpt-oss-20b'};
const independent={providerId:'openai' as const,modelId:'gpt-4o-mini',supportsGroqReasoning:false};
assert.deepEqual(groqReasoningBodyOptions({...qwen,reasoning:{effort:'none',format:'hidden'}}),{
  reasoning_effort:'none',reasoning_format:'hidden',
});
assert.deepEqual(groqReasoningBodyOptions({...gpt,reasoning:{effort:'none',format:'hidden'}}),{
  reasoning_effort:'low',include_reasoning:false,
});
assert.deepEqual(groqReasoningBodyOptions({...gpt,reasoning:{effort:'low',format:'hidden'}}),{
  reasoning_effort:'low',include_reasoning:false,
});
assert.deepEqual(groqReasoningBodyOptions({...gpt20,reasoning:{effort:'default',format:'hidden'}}),{
  reasoning_effort:'medium',include_reasoning:false,
});
assert.deepEqual(groqReasoningBodyOptions({...independent,reasoning:{effort:'low',format:'hidden'}}),{});
assert.deepEqual(groqReasoningBodyOptions({
  providerId:'groq',modelId:'unknown/future',supportsGroqReasoning:true,
  reasoning:{effort:'none',format:'hidden'},
}),{});
assert.throws(()=>groqReasoningBodyOptions({...gpt,reasoning:{effort:'xhigh'}}),/Unsupported reasoning effort/);
assert.equal(readToolSelectorMaxOutputTokens('openai/gpt-oss-120b'),640);
assert.equal(readToolSelectorMaxOutputTokens('openai/gpt-oss-20b'),640);
assert.equal(readToolSelectorMaxOutputTokens('qwen/qwen3.8-27b'),280);

const context={requestId:'test-request',timeoutMs:2500};
const fakeCompletion={
  model:'openai/gpt-oss-120b',
  choices:[{message:{content:'I can review your authorized work.'}}],
  usage:{prompt_tokens:10,completion_tokens:15,total_tokens:25},
};
let actualNonStreaming:Record<string,unknown>|null=null;
const provider=new GroqChatProvider({
  apiKey:'not-real',model:'openai/gpt-oss-120b',
  fetch:(async(_url,init)=>{
    actualNonStreaming=JSON.parse(String(init?.body));
    return new Response(JSON.stringify(fakeCompletion),{
      status:200,headers:{'content-type':'application/json'},
    });
  }) as typeof fetch,
});
const result=await provider.complete({
  messages:[{role:'user',content:'Please show my last notes'}],
  reasoning:{effort:'none',format:'hidden'},
  tools:[{name:'get_notes',description:'Get authorized Notes',inputSchema:{type:'object',properties:{limit:{type:'number'}}}}],
  maxOutputTokens:640,
},context);
assert.match(result.text,/authorized work/);
assert.ok(actualNonStreaming);
const body=actualNonStreaming as Record<string,unknown>;
assert.equal(body.reasoning_effort,'low');
assert.equal(body.include_reasoning,false);
assert.equal(body.reasoning_format,undefined);
assert.equal(body.max_completion_tokens,640);
assert.equal(body.parallel_tool_calls,false);

let streamBody:Record<string,unknown>|null=null;
const providerStream=new GroqChatProvider({
  apiKey:'not-real',model:'openai/gpt-oss-120b',
  fetch:(async(_url,init)=>{
    streamBody=JSON.parse(String(init?.body));
    return new Response('data: {"model":"openai/gpt-oss-120b","choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',{
      status:200,headers:{'content-type':'text/event-stream'},
    });
  }) as typeof fetch,
});
const events=[];
for await(const event of providerStream.stream({
  messages:[{role:'user',content:'Hello'}],
  reasoning:{effort:'low',format:'hidden'},
  maxOutputTokens:1024,
},context))events.push(event);
assert.ok(events.some(event=>event.type==='text_delta'));
assert.equal((streamBody as unknown as Record<string,unknown>).reasoning_format,undefined);
assert.equal((streamBody as unknown as Record<string,unknown>).include_reasoning,false);
assert.equal((streamBody as unknown as Record<string,unknown>).reasoning_effort,'low');

let qwenBody:Record<string,unknown>|null=null;
const qwenProvider=new GroqChatProvider({
  apiKey:'not-real',model:'qwen/qwen3.8-27b',
  fetch:(async(_url,init)=>{
    qwenBody=JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      model:'qwen/qwen3.8-27b',choices:[{message:{content:'OK'}}],
    }),{status:200,headers:{'content-type':'application/json'}});
  }) as typeof fetch,
});
await qwenProvider.complete({messages:[{role:'user',content:'Merhaba'}],
  reasoning:{effort:'none',format:'hidden'}},context);
assert.equal((qwenBody as unknown as Record<string,unknown>).reasoning_effort,'none');
assert.equal((qwenBody as unknown as Record<string,unknown>).reasoning_format,'hidden');
assert.equal((qwenBody as unknown as Record<string,unknown>).include_reasoning,undefined);

const userQuestion='tell me about Creating a few processes with another Google account in my checklists??';
const intent=classifyChatIntent(userQuestion);
assert.equal(intent,'knowledge');
const direct=planDirectAIReadTools(userQuestion,{origin:'global'});
assert.equal(direct.length,0);
assert.equal(shouldUseModelToolSelection(userQuestion,direct,{origin:'global'}),true);
const decision=selectChatModel({
  intent,question:userQuestion,profile:'general',writeRequested:false,
  organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',configuredMaxOutputTokens:900,
  env:{
    GROQ_CHAT_MODEL:'qwen/qwen3.8-27b',
    AI_PROVIDER_ADMISSION_V2_ENABLED:'true',
    AI_MODEL_ROUTING_ENABLED:'true',
    AI_MODEL_ROUTING_ROLLOUT_PERCENT:'100',
  },
});
assert.equal(decision.model,'qwen/qwen3.8-27b',
  'The screenshot question is knowledge intent, so 100% rollout does not force GPT-OSS.');
assert.equal(decision.route,'deep');

const route=readFileSync('app/api/ai/chat/route.ts','utf8');
assert.match(route,/providerCategory:providerFailure\?\.code/);
assert.match(route,/failureStage/);
assert.match(route,/PROVIDER_REQUEST_REJECTED/);
assert.match(route,/readToolSelectorMaxOutputTokens\(model\)/);
assert.match(route,/readToolSelectorMaxOutputTokens\(backupProvider\.modelId\)/);

console.log(JSON.stringify({
  suite:'groq-multimodel-request-compat',status:'passed',
  nonStreaming:true,streaming:true,independentProvider:true,
  screenshotQuestionRoute:'qwen-deep',providerCallsAreMocked:true,
}));
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
