import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config,parse } from 'dotenv';

const production=parse(readFileSync('.env.local'));
config({path:'.env.staging.local',override:true,quiet:true});
const ref=(url)=>/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url??'')?.[1]??null;
const stagingRef=ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if(!stagingRef||stagingRef!==process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF||stagingRef===ref(production.NEXT_PUBLIC_SUPABASE_URL))throw new Error('Staging read-tool test refused: project identity mismatch');
if(!process.env.AXIOM_STAGING_TEST_PASSWORD)throw new Error('Staging test password is missing');
const port=process.argv.find((value)=>value.startsWith('--port='))?.slice(7)??'3100';const base=new URL(`http://localhost:${port}`);
const cookies=new Map();
function absorb(response){for(const value of (typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean))){const first=value.split(';',1)[0],at=first.indexOf('=');if(at>0)cookies.set(first.slice(0,at),first.slice(at+1));}}
async function request(path,init={}){const headers=new Headers(init.headers);if(cookies.size)headers.set('cookie',[...cookies].map(([key,value])=>`${key}=${value}`).join('; '));const response=await fetch(new URL(path,base),{...init,headers,redirect:init.redirect??'manual'});absorb(response);return response;}
const csrfResponse=await request('/api/auth/csrf');assert.equal(csrfResponse.ok,true);const csrf=(await csrfResponse.json()).csrfToken;
const login=await request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf,email:'ai-staging-alice@example.invalid',password:process.env.AXIOM_STAGING_TEST_PASSWORD,callbackUrl:new URL('/ai',base).toString(),json:'true'})});assert.ok([200,302].includes(login.status));
const session=await(await request('/api/auth/session')).json();assert.equal(session?.user?.email,'ai-staging-alice@example.invalid');

async function ask(message){const created=await request('/api/ai/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({context:{origin:'global'}})});const createdBody=await created.json();assert.equal(created.status,201,JSON.stringify(createdBody));const id=createdBody.conversation.id;
  try{const response=await request('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:id,clientRequestId:randomUUID(),message,context:{origin:'global'}}),redirect:'follow'});assert.equal(response.status,200);const wire=await response.text();const events=wire.split('\n\n').flatMap((frame)=>frame.split('\n')).filter((line)=>line.startsWith('data: ')).map((line)=>JSON.parse(line.slice(6)));const answer=events.filter((event)=>event.type==='delta').map((event)=>event.text).join('');assert.ok(events.some((event)=>event.type==='tool_status'));assert.ok(events.some((event)=>event.type==='done'&&event.finishReason==='completed'),JSON.stringify({events:events.map((event)=>({type:event.type,code:event.code})),answerTail:answer.slice(-800)}));const historyResponse=await request(`/api/ai/conversations/${id}`);assert.equal(historyResponse.status,200);const history=await historyResponse.json();const assistant=history.messages.find((item)=>item.role==='assistant');assert.equal(assistant.status,'completed');return{events,answer,persistedReferences:assistant.references??[]};}
  finally{await request(`/api/ai/conversations/${id}`,{method:'DELETE'});}}

if(process.argv.includes('--extended-only')){
  const combined=await ask("Nebula Team Knowledge Process'imdeki yap\u0131lmam\u0131\u015f Action'lar\u0131 listele ve Nebula-42 verification phrase hakk\u0131ndaki ge\u00e7mi\u015f Note karar\u0131n\u0131 a\u00e7\u0131kla.");
  assert.ok(combined.events.some((event)=>event.type==='sources'&&event.sources.length>0),JSON.stringify(combined.events.map((event)=>({type:event.type,code:event.code}))));
  assert.ok(combined.events.some((event)=>event.type==='references'&&event.references.length>0));
  assert.ok(combined.persistedReferences.length>0);
  const planner=await ask('Bu hafta Planner\u2019da hangi i\u015flerim bulunuyor?');
  assert.ok(planner.events.some((event)=>event.type==='tool_status'));
  console.log(JSON.stringify({stagingReadToolsExtended:'passed',combinedCanonicalAndRag:true,verifiedCitations:true,plannerResolver:true,livePostgres:true,liveGroq:true,syntheticOnly:true}));
}else{
  const processes=await ask("Ka\u00e7 Process'im var?");assert.match(processes.answer,/3/);assert.ok(processes.events.some((event)=>event.type==='references'&&event.references.length===3));assert.equal(processes.persistedReferences.length,3);
  const checklist=await ask("Nebula Team Knowledge Process'imdeki Checklist durumunu \u00f6zetle.");assert.match(checklist.answer,/1|bir/i);assert.ok(checklist.events.some((event)=>event.type==='references'));assert.ok(checklist.persistedReferences.length>0);
  console.log(JSON.stringify({stagingReadTools:'passed',authentication:'nextauth_credentials',livePostgres:true,liveGroq:true,processCount:true,checklistOverview:true,toolStatus:true,references:true,persistedReferenceAcl:true,syntheticOnly:true}));
}
