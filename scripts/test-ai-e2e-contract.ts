import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GroqChatProvider } from '../lib/ai/providers/groq-chat-provider';
import { sanitizeAnswerCitations,citationIdsFromAnswer } from '../lib/ai/chat/citations';
import { encodeChatSSE,parseChatSSEBuffer } from '../lib/ai/chat/sse';

const valid='a'.repeat(64),invented='b'.repeat(64);
const chunks=[
  { model:'synthetic-qwen',choices:[{ delta:{ content:`Verified [cite:${valid}] ` } }] },
  { model:'synthetic-qwen',choices:[{ delta:{ content:`invented [cite:${invented}]` } }] },
  { model:'synthetic-qwen',choices:[],usage:{ prompt_tokens:20,completion_tokens:8,total_tokens:28 } },
];
async function main() {
const body=chunks.map((chunk)=>`data: ${JSON.stringify(chunk)}\n\n`).join('')+'data: [DONE]\n\n';
const provider=new GroqChatProvider({ apiKey:'synthetic',model:'synthetic-qwen',fetch:async()=>new Response(body,{
  status:200,headers:{ 'Content-Type':'text/event-stream' },
}) });
let answer='',usageSeen=false,doneSeen=false;
for await(const event of provider.stream({ messages:[{ role:'user',content:'synthetic question' }],maxOutputTokens:64 },{
  requestId:randomUUID(),timeoutMs:5_000,
})) {
  if(event.type==='text_delta') answer+=event.text;
  if(event.type==='usage') usageSeen=event.usage.totalTokens===28;
  if(event.type==='done') doneSeen=true;
}
assert.equal(usageSeen,true);assert.equal(doneSeen,true);
const safe=sanitizeAnswerCitations(answer,new Set([valid]));
assert.deepEqual(citationIdsFromAnswer(safe),[valid]);
assert.doesNotMatch(safe,new RegExp(invented));

const wire=encodeChatSSE({ type:'delta',text:safe })+encodeChatSSE({ type:'sources',sources:[] })
  +encodeChatSSE({ type:'done',finishReason:'completed' });
let remainder='',events:any[]=[];
for(let offset=0;offset<wire.length;offset+=7) {
  const parsed=parseChatSSEBuffer(remainder+wire.slice(offset,offset+7));
  remainder=parsed.remainder;events.push(...parsed.events);
}
assert.deepEqual(events.map((event)=>event.type),['delta','sources','done']);

const route=readFileSync('app/api/ai/chat/route.ts','utf8');
assert.ok(route.indexOf('reserveChatRun(')<route.indexOf('reserveAIQuota('));
assert.ok(route.indexOf('reserveAIQuota(')<route.indexOf('new GroqChatProvider()'));
assert.match(route,/createRequestSignal\(aiChatLimits\.timeoutMs,request\.signal\)/);
assert.match(route,/sources:verified,/);
assert.match(route,/grounding \}\);/);
assert.match(route,/type:'sources',sources:verified/);
const history=readFileSync('lib/ai/chat/conversation-server.ts','utf8');
assert.match(history,/ai_validate_chat_message_access/);
assert.match(history,/sourceAccessRevoked:true/);
const ui=readFileSync('components/ai/AxiomAIChat.tsx','utf8');
assert.match(ui,/parseChatSSEBuffer/);assert.match(ui,/abortRef\.current\?\.abort\(\)/);
assert.doesNotMatch(ui,/dangerouslySetInnerHTML/);

console.log(JSON.stringify({ syntheticStreamingRagContractChecks:13,liveProviderCalls:false,liveDatabase:false,browser:false }));
}

main().catch((error)=>{ console.error(error);process.exitCode=1; });
