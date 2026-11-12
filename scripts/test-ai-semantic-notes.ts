import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDirectAIReadTools,shouldUseModelToolSelection } from '../lib/ai/agent/router';
import { canReadCanonicalNote } from '../lib/ai/agent/note-access-policy';
import { renderCanonicalWorkspaceAnswer } from '../lib/ai/agent/canonical-answer';
import type { AIReadToolExecution } from '../lib/ai/agent/types';

const global={origin:'global' as const};
const direct=(question:string,context=global as any)=>planDirectAIReadTools(question,context);
const first=(question:string)=>direct(question)[0];
const snapshot=[
  'en son aldığım not ne benim?',
  'En son eklediğim not neydi?',
  'son yazdığım not hangisi',
  'what is my last note',
  'What is my most recent note?',
  'son oluşturduğum NOT nedir',
];
for(const prompt of snapshot){
  const action=first(prompt);
  assert.equal(action?.name,'get_notes',prompt);
  const args=action.arguments as any;
  assert.equal(args.sort,'created_desc',prompt);
  assert.equal(args.authorScope,'mine',prompt);
  assert.equal(args.limit,1,prompt);
  assert.equal(args.answerStyle,'list',prompt);
}
const edited=first('En son düzenlediğim not hangisi?');
assert.equal(edited.name,'get_notes');
assert.equal((edited.arguments as any).sort,'updated_desc');

const shared=first('en son notlarımızı göster');
assert.equal(shared.name,'get_notes');
assert.equal((shared.arguments as any).authorScope,'accessible');

const byTopic=first('cocoindex hakkında notlarımda neler var?');
assert.equal(byTopic.name,'get_notes');
assert.equal((byTopic.arguments as any).query.toLowerCase(),'cocoindex');
assert.equal(first('what is my notes about cocoindex?').name,'get_notes');

const processRead=first('İş Arama sürecimdeki notların içeriğini göster');
assert.equal(processRead.name,'get_process_content');
assert.equal((processRead.arguments as any).processName,'İş Arama');
const allRecent=first('Son yaptıklarımı ve son notlarımı göster');
assert.equal(allRecent.name,'get_recent_workspace');

const vagueCases=[
  'Where is that thing I wrote previously?',
  'Bana geçen hafta neler olduğunu anlatır mısın?',
  'What was my most recent saved entry?',
  'Daha önce verdiğim kararlar ne yöndeydi?',
];
for(const prompt of vagueCases)
  assert.equal(shouldUseModelToolSelection(prompt,[],global),true,prompt);
assert.equal(shouldUseModelToolSelection('Hello!',[],global),false);
assert.equal(shouldUseModelToolSelection('Thanks',[],global),false);
assert.equal(shouldUseModelToolSelection('Bu kartların güncel durumunu kontrol et',[],global),false);
assert.equal(shouldUseModelToolSelection('Bu kartların güncel durumunu kontrol et',[],{
  origin:'global',processId:'11111111-1111-4111-8111-111111111111',
}),true);

const teams=new Set(['team-1','team-2']);
const projects=new Map([
  ['p-visible',{id:'p-visible',team_id:'team-1'}],
  ['p-teamless',{id:'p-teamless',team_id:null}],
]);
const task={id:'task-a',team_id:'team-1',project_id:'p-visible',title:'Action'};
const note={task_id:'task-a',team_id:'team-1'};
assert.equal(canReadCanonicalNote(note,task,teams,projects),true);
assert.equal(canReadCanonicalNote(note,task,teams,projects,'p-visible'),true);
assert.equal(canReadCanonicalNote(note,task,teams,projects,'p-hidden'),false);
assert.equal(canReadCanonicalNote(note,undefined,teams,projects),false);
assert.equal(canReadCanonicalNote({...note,task_id:'other'},task,teams,projects),false);
assert.equal(canReadCanonicalNote({...note,team_id:'team-2'},task,teams,projects),false);
assert.equal(canReadCanonicalNote(note,task,new Set(['team-2']),projects),false);
assert.equal(canReadCanonicalNote(note,{...task,project_id:'p-hidden'},teams,projects),false);
assert.equal(canReadCanonicalNote(note,{...task,project_id:'p-teamless'},teams,projects),true);
assert.equal(canReadCanonicalNote(note,{...task,project_id:null},teams,projects),true);
assert.equal(canReadCanonicalNote(note,{...task,project_id:null},teams,projects,'p-visible'),false);
assert.equal(canReadCanonicalNote(note,{...task,team_id:'team-2'},teams,projects),false);
assert.equal(canReadCanonicalNote(note,{...task,project_id:'p-visible'},teams,new Map([
  ['p-visible',{id:'p-visible',team_id:'team-2'}],
])),false,'A Project from another Team must not authorize this Note');

const exec=(data:unknown):AIReadToolExecution=>({
  name:'get_notes',data,references:[],citations:[],statusLabel:'test',
});
const newNote={
  id:'note-1',title:'My latest Note',createdAt:'2026-11-12T12:00:00Z',
  updatedAt:'2026-11-12T12:30:00Z',
  actionTitle:'YHT',processName:'Delta Marine',preview:'I updated the architecture notes',
};
const oldNote={
  id:'note-2',title:'Older Note',createdAt:'2026-11-10T12:00:00Z',
  updatedAt:'2026-11-11T12:30:00Z',
  actionTitle:'TLSuite',processName:'Delta Marine',preview:'Earlier notes',
};
const enAnswer=renderCanonicalWorkspaceAnswer('what is my last note',[
  exec({notes:[newNote],sort:'created_desc',answerStyle:'list',partialScan:false,hasMore:false}),
]);
assert.match(enAnswer??'',/Your latest created Note/);
assert.match(enAnswer??'',/My latest Note/);
assert.match(enAnswer??'',/YHT/);
assert.match(enAnswer??'',/2026-11-12/);
const trAnswer=renderCanonicalWorkspaceAnswer('en son aldığım not ne benim?',[
  exec({notes:[newNote],sort:'created_desc',answerStyle:'list',partialScan:false,hasMore:false}),
]);
assert.match(trAnswer??'',/En son oluşturduğunuz not/);
assert.match(trAnswer??'',/Delta Marine/);
assert.match(renderCanonicalWorkspaceAnswer('en son düzenlediğim not',[
  exec({notes:[oldNote],sort:'updated_desc',answerStyle:'list',partialScan:false}),
])??'',/En son güncellenen not/);
const empty=renderCanonicalWorkspaceAnswer('what was my last note',[
  exec({notes:[],sort:'created_desc',answerStyle:'list',partialScan:true}),
]);
assert.match(empty??'',/cannot confirm that no Notes exist/);
assert.equal(renderCanonicalWorkspaceAnswer('YHT notlarımdan çıkarım yap',[
  exec({notes:[newNote],answerStyle:'analysis'}),
]),null,'Analysis must use LLM and verified Note context');
assert.equal(renderCanonicalWorkspaceAnswer('List Notes',[
  exec({error:'forbidden',message:'denied'}),
]),null,'Never turn an authorization error into a zero result');

const source=(path:string)=>readFileSync(path,'utf8');
const readTools=source('lib/ai/agent/read-tools.ts');
const noteReader=source('lib/ai/agent/canonical-note-reader.ts');
const selector=source('lib/ai/agent/selector.ts');
const route=source('app/api/ai/chat/route.ts');
assert.match(readTools,/get_notes:notesSchema/);
assert.match(readTools,/runNotes/);
assert.match(readTools,/listCanonicalAuthorizedNotes/);
assert.match(noteReader,/supabaseAdmin\.from\('notes'\)/);
assert.match(noteReader,/\.eq\('organization_id',input\.actor\.organizationId\)/);
assert.match(noteReader,/\.in\('team_id',group\)/);
assert.match(noteReader,/\.eq\('author_id',input\.actor\.userId\)/);
assert.match(noteReader,/canReadCanonicalNote/);
assert.match(noteReader,/partialScan/);
assert.match(noteReader,/const matchesBeforeGroup=matches.length/);
assert.match(selector,/get_notes with sort=created_desc/);
assert.match(selector,/You have no write tools/);
assert.match(route,/shouldUseModelToolSelection\(input.message,directReadToolCalls,effectiveContext\)/);
assert.match(route,/selectedCanonical=renderCanonicalWorkspaceAnswer/);
assert.match(route,/definitelyNoNewProviderTokens=true/);
assert.match(source('lib/ai/agent/context.ts'),/latestNotes/);
assert.doesNotMatch(noteReader,/\.insert\(|\.update\(|\.delete\(/);
console.log(JSON.stringify({
  suite:'ai-semantic-notes-grounding',
  status:'passed',testPrompts:24,authorizationCases:13,
  liveDatabaseCalls:false,liveProviderCalls:false,
}));
