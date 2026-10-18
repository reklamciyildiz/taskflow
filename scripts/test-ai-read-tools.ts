import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAIReadToolContext } from '../lib/ai/agent/context';
import { planDirectAIReadTools,shouldUseModelToolSelection } from '../lib/ai/agent/router';
import { selectAIReadTools } from '../lib/ai/agent/selector';
import { estimateTokens } from '../lib/ai/utils/token-counter';
import { planChatContext } from '../lib/ai/chat/context-budget';
import type { ChatProvider } from '../lib/ai/providers/contracts';

const globalContext={origin:'global' as const};
assert.deepEqual(planDirectAIReadTools("Ka\u00e7 Process'im var?",globalContext).map((call)=>call.name),['list_processes']);
const alum=planDirectAIReadTools("Alumas Process'imde ka\u00e7 Action var?",globalContext);
assert.equal(alum[0].name,'list_actions');
assert.equal((alum[0].arguments as any).processName,'Alumas');
assert.equal((alum[0].arguments as any).completion,'all');
const incomplete=planDirectAIReadTools("SmartSafe AI'da tamamlanmam\u0131\u015f Action'lar hangileri?",globalContext);
assert.equal(incomplete[0].name,'list_actions');
assert.equal((incomplete[0].arguments as any).completion,'incomplete');
assert.equal((incomplete[0].arguments as any).processName,'SmartSafe AI');
assert.deepEqual(planDirectAIReadTools("G\u00fcn G\u00fcn Process'imdeki Checklist durumunu \u00f6zetle.",globalContext).map((call)=>call.name),['get_process_overview']);
assert.deepEqual(planDirectAIReadTools("Nebula Team Knowledge Process'imdeki Checklist durumunu \u00f6zetle.",globalContext).map((call)=>call.name),['get_process_overview']);
assert.equal((planDirectAIReadTools('Bu hafta Planner\u2019da hangi i\u015flerim bulunuyor?',globalContext)[0].arguments as any).range,'this_week');
assert.deepEqual(planDirectAIReadTools("Alumas'taki yap\u0131lmam\u0131\u015f i\u015fleri ve ge\u00e7mi\u015f Notes kararlar\u0131n\u0131 birlikte de\u011ferlendir.",globalContext).map((call)=>call.name),['list_actions','search_knowledge']);
assert.equal(shouldUseModelToolSelection('Bu kartlar\u0131n g\u00fcncel durumunu kontrol et',[]),false);
assert.equal(shouldUseModelToolSelection('Action verilerimi ayr\u0131nt\u0131l\u0131 de\u011ferlendir',[]),true);

const mockProvider:ChatProvider={
  providerId:'mock',modelId:'mock',normalizeError(){return{code:'unknown',message:'mock',retryable:false}},
  async complete(){return{text:'',toolCalls:[{id:'call-1',name:'list_processes',arguments:{limit:10}},{id:'call-2',name:'create_action',arguments:{}}],usage:{inputTokens:120,outputTokens:20},model:'mock',latencyMs:1}},
  async *stream(){yield{type:'done',model:'mock',latencyMs:1}},
};
async function run() {
const selected=await selectAIReadTools({provider:mockProvider,question:'S\u00fcre\u00e7leri kontrol et',history:[],signal:new AbortController().signal,timeoutMs:5_000});
assert.deepEqual(selected.calls.map((call)=>call.name),['list_processes']);
assert.equal(selected.inputTokens,120);

const bounded=buildAIReadToolContext([{name:'list_actions',statusLabel:'x',citations:[],references:[],data:{actions:Array.from({length:100},(_,index)=>({title:`Action ${index} ${'x'.repeat(100)}`}))}}],300);
assert.ok(estimateTokens(bounded)<=310);

const combinedContext=planChatContext({intent:'structured',question:'Action ve ge\u00e7mi\u015f Note karar\u0131',history:[],
  citations:[{citationId:'a'.repeat(64),sourceDocumentId:'10000000-0000-4000-8000-000000000001',sourceType:'note',sourceId:'note',actionId:null,checklistItemId:null,noteId:'20000000-0000-4000-8000-000000000001',processId:'30000000-0000-4000-8000-000000000001',attachmentId:null,process:{id:'30000000-0000-4000-8000-000000000001',name:'Process'},title:'Note',snippet:'Decision',sourceUpdatedAt:new Date(0).toISOString(),chunk:{id:'a'.repeat(64),ordinal:0},index:{version:'v1',embeddingModel:'model'},score:{mode:'hybrid',semantic:0.8,keyword:1,fused:1,semanticRank:1,keywordRank:1},navigation:{target:'note',actionId:null,sourceId:'note'}}],
  agentContext:'[{"tool":"list_actions","result":{"total":1}}]',configuredMaxOutputTokens:2048});
assert.equal(combinedContext.citations.length,1);
assert.match(combinedContext.messages.at(-2)?.content??'',/VERIFIED KNOWLEDGE SOURCES/);

const registry=readFileSync('lib/ai/agent/read-tools.ts','utf8');
assert.doesNotMatch(registry,/\.insert\(|\.update\(|\.delete\(/);
assert.match(registry,/projectDb\.getVisibleForUser/);
assert.match(registry,/isTerminalBoardColumn/);
assert.match(registry,/extractChecklistItemsFromTipTap/);
assert.match(registry,/getPlannerUpcomingProjection/);
assert.match(registry,/retrieveKnowledge/);
const route=readFileSync('app/api/ai/chat/route.ts','utf8');
assert.match(route,/AXIOM_AI_READ_TOOLS_ENABLED|areAIReadToolsEnabled/);
assert.match(route,/slice\(0,2\)/);
assert.match(route,/modelToolSelection/);

console.log(JSON.stringify({readToolContractChecks:25,liveProviderCalls:false,liveDatabaseCalls:false}));
}

void run();
