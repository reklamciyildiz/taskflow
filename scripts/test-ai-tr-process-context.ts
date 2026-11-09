import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferAIChatLanguage } from '../lib/ai/chat/language';
import { classifyChatIntent, fixedProductHelp } from '../lib/ai/chat/intent';
import { buildChatMessages } from '../lib/ai/chat/prompt';
import { planDirectAIReadTools, shouldUseModelToolSelection } from '../lib/ai/agent/router';
import { buildAIReadToolContext } from '../lib/ai/agent/context';
import { shouldPlanAIWrite } from '../lib/ai/agent/write-selector';
import { estimateTokens } from '../lib/ai/utils/token-counter';
import type { AIReadToolExecution } from '../lib/ai/agent/types';

const global={origin:'global' as const};
const focused={origin:'global' as const,processId:'11111111-1111-4111-8111-111111111111'};
const from=(question:string,context=global as any)=>{
  const calls=planDirectAIReadTools(question,context);
  assert.ok(calls.length,'Expected an authorized canonical read tool candidate: '+question);
  return calls[0];
};
const contentQuestions=[
  ["İş Arama sürecimdeki notların içeriğini göster", 'İş Arama'],
  ["Benim İş Arama isimli Process'imdeki açıklamaların detaylarını oku", 'İş Arama'],
  ["Lütfen İş Arama sürecimin içeriğini anlat", 'İş Arama'],
  ["Alumas'taki notların içeriğini özetle", 'Alumas'],
  ["Gün Gün sürecinde neler var?", 'Gün Gün'],
  ["Read the notes in Job Search Process", 'Job Search'],
];
for(const [question,expectedName] of contentQuestions){
  const call=from(question);
  assert.equal(call.name,'get_process_content',question);
  assert.equal((call.arguments as any).processName,expectedName,question);
  assert.equal((call.arguments as any).limit,5);
}
const focusedCall=from('Bu sürecin içeriği nedir?',focused);
assert.equal(focusedCall.name,'get_process_content');
assert.equal((focusedCall.arguments as any).processId,focused.processId);
assert.equal(shouldUseModelToolSelection('Süreçlerimin içeriğinde neler var?',[]),true);
assert.deepEqual(planDirectAIReadTools("Kaç Process'im var?",global).map(x=>x.name),['list_processes']);
assert.deepEqual(planDirectAIReadTools("Gün Gün Process'imdeki Checklist durumunu özetle.",global).map(x=>x.name),['get_process_overview']);

assert.equal(inferAIChatLanguage('İş Arama sürecimdeki notları okuyabilir misin?'),'tr');
assert.equal(inferAIChatLanguage('Aksiyonlarımı listele lütfen'),'tr');
assert.equal(inferAIChatLanguage('Surecimde neler var?'),'tr');
assert.equal(inferAIChatLanguage('Please summarize the İş Arama Process'),'en');
assert.equal(inferAIChatLanguage('Hello, what is my project status?'),'en');
assert.equal(classifyChatIntent('Notlarımın içeriği nedir?'),'knowledge');
assert.equal(classifyChatIntent('Bugün kaç aksiyon tamamlandı?'),'structured');
assert.match(fixedProductHelp('How can I use Knowledge Hub?')??'',/searches the Actions/);
assert.match(fixedProductHelp('Knowledge Hub nasıl çalışır?')??'',/erişebildiğiniz/);

const trMessages=buildChatMessages({history:[],question:'İş Arama sürecimin içeriğini özetle'});
assert.match(trMessages[0].content,/Answer in fluent, idiomatic Turkish/);
assert.match(trMessages[0].content,/pagination\.hasMore/);
const enMessages=buildChatMessages({history:[],question:'Please summarize my tasks'});
assert.match(enMessages[0].content,/Respond in English/);
assert.ok(shouldPlanAIWrite('Aksiyonuma açıklama ekle',true));
assert.ok(shouldPlanAIWrite('Aksiyonumu güncelle',true));
assert.equal(shouldPlanAIWrite('Aksiyonumu göster',true),false,'Read-only question must not create a proposal');

const execution:AIReadToolExecution={
  name:'get_process_content',statusLabel:'x',references:[],citations:[],
  data:{
    process:{id:'project-a',name:'My Process'},
    pagination:{offset:0,limit:5,returned:5,totalActions:75,hasMore:true},
    linkedNotesInActionPage:{returned:5,total:16,hasMore:true},
    actions:Array.from({length:5},(_,i)=>({
      id:'action-'+i,title:'A'+i,description:'a'.repeat(1000),
      notes:{items:[{title:'Note',preview:'b'.repeat(650)}]},
      checklist:{items:Array.from({length:10},(_,n)=>({text:'c'.repeat(180),checked:n%2===0}))},
    })),
  },
};
const bounded=buildAIReadToolContext([execution],450);
assert.doesNotThrow(()=>JSON.parse(bounded),'Context must remain valid JSON even when long');
assert.ok(estimateTokens(bounded)<=450,'Context must respect bounded token budget');
const parsed=JSON.parse(bounded);
assert.equal(parsed[0].tool,'get_process_content');
assert.equal(parsed[0].result.contextWindowLimited,true);
assert.equal(parsed[0].result.pagination.hasMore,true);
assert.equal(parsed[0].result.pagination.totalActions,75);
const shortContext=buildAIReadToolContext([{
  ...execution,data:{process:{id:'p',name:'P'},
    pagination:{offset:0,limit:5,returned:1,totalActions:1,hasMore:false},
    actions:[{title:'Actual title',description:'Canonical text'}]},
}],2_300);
assert.match(shortContext,/Canonical text/);

const readTools=readFileSync('lib/ai/agent/read-tools.ts','utf8');
assert.match(readTools,/runProcessContent/);
assert.match(readTools,/projectDb\.getVisibleForUser/);
assert.match(readTools,/\.eq\('organization_id',actor\.organizationId\)\.eq\('project_id',process\.id\)/);
assert.match(readTools,/\.eq\('organization_id',actor\.organizationId\)\.in\('task_id',ids\)/);
assert.match(readTools,/const allowedTaskIds=new Set\(ids\)/);
assert.match(readTools,/pagination:/);
assert.match(readTools,/descriptionTruncated/);
assert.match(readTools,/linkedNotesInActionPage/);
assert.doesNotMatch(readTools,/\.insert\(|\.update\(|\.delete\(/);
const definitions=readFileSync('lib/ai/agent/definitions.ts','utf8');
assert.match(definitions,/get_process_content/);
const route=readFileSync('app/api/ai/chat/route.ts','utf8');
assert.match(route,/inferAIChatLanguage/);
assert.match(route,/readToolExecutions\.flatMap/);
console.log(JSON.stringify({suite:'ai-tr-process-context',status:'PASS',liveProviderCalls:false,liveDatabaseCalls:false}));
