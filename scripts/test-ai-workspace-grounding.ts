import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDirectAIReadTools, shouldUseModelToolSelection } from '../lib/ai/agent/router';
import { canReadScopedAction,selectRequestedActionCount } from '../lib/ai/agent/scoped-action-access';
import { renderCanonicalWorkspaceAnswer } from '../lib/ai/agent/canonical-answer';
import type { AIReadToolExecution } from '../lib/ai/agent/types';

const global={origin:'global' as const};
const calls=(prompt:string)=>planDirectAIReadTools(prompt,global);
const userScreenshot=calls('provide me my actions five names!');
assert.deepEqual(userScreenshot.map(x=>x.name),['list_actions']);
assert.equal((userScreenshot[0].arguments as any).limit,5);
assert.equal(selectRequestedActionCount('my five actions',20),5);
assert.equal(selectRequestedActionCount('ilk 5 aksiyonum',20),5);
assert.equal(selectRequestedActionCount('son 3 görevim',20),3);
assert.equal(selectRequestedActionCount('please show 10 tasks',20),10);
assert.equal(selectRequestedActionCount('listele',20),20);

const recentScreenshot=calls('son yaptıklarımı özetler misin bana, en son notlarımı!');
assert.equal(recentScreenshot[0]?.name,'get_recent_workspace');
assert.equal((recentScreenshot[0].arguments as any).focus,'all');
assert.equal(calls('could you please provide me what you did as last!')[0].name,'get_recent_workspace');

const noteSearch=calls('cocoindex hakkında notlarımda neler var?');
assert.equal(noteSearch[0]?.name,'get_recent_workspace');
assert.equal((noteSearch[0].arguments as any).query.toLowerCase(),'cocoindex');
assert.equal((noteSearch[0].arguments as any).focus,'notes');
const enNotes=calls('what is my notes about cocoindex?');
assert.equal(enNotes[0]?.name,'get_recent_workspace');
assert.equal((enNotes[0].arguments as any).query,'cocoindex');
assert.equal(calls('List my most recent Notes')[0].name,'get_recent_workspace');
assert.equal(calls('I have Delta Marine process, do you know it?')[0].name,'get_process_overview');
assert.equal((calls('I have Delta Marine process, do you know it?')[0].arguments as any).processName,'Delta Marine');
assert.equal(shouldUseModelToolSelection('Could you list my actions?',[]),true);

const processId='10000000-0000-4000-8000-000000000001';
const teamId='20000000-0000-4000-8000-000000000001';
const alienTeam='30000000-0000-4000-8000-000000000001';
const teams=new Set([teamId]);
const visible=new Map([[processId,{id:processId,team_id:teamId}]]);
assert.equal(canReadScopedAction({project_id:processId,team_id:alienTeam},teams,visible),true,
  'Canonical visible Process team overrides stale task.team_id');
assert.equal(canReadScopedAction({project_id:processId,team_id:null},teams,visible),true);
assert.equal(canReadScopedAction({project_id:'00000000-0000-4000-8000-000000000666',team_id:teamId},teams,visible),false,
  'Invisible Process must never leak its Action');
assert.equal(canReadScopedAction({project_id:null,team_id:alienTeam},teams,visible),false,
  'General Action must remain Team-scoped');
assert.equal(canReadScopedAction({project_id:null,team_id:teamId},teams,visible),true);
assert.equal(canReadScopedAction({project_id:processId,team_id:teamId},new Set([alienTeam]),visible),false,
  'A Process from another Team may not be read');
const teamless=new Map([[processId,{id:processId,team_id:null}]]);
assert.equal(canReadScopedAction({project_id:processId,team_id:alienTeam},teams,teamless),false,
  'Teamless Process must not expand Action access beyond Team');

const fakeExecution=(name:AIReadToolExecution['name'],data:unknown):AIReadToolExecution=>({
  name,data,refs:undefined as never,references:[],citations:[],statusLabel:'synthetic',
});
const titles=['Tech Stacks','VB.NET','YHT','TLSuite Geliştirilmesi Gerekenler','KnowledgeBase Project'];
const actions=fakeExecution('list_actions',{
  total:8,partialScan:false,actions:titles.map(title=>({title,processName:'Delta Marine',stageLabel:'Projeler'})),
});
const answer=renderCanonicalWorkspaceAnswer('provide me my actions five names!', [actions]);
assert.ok(answer);
for(const title of titles)assert.ok(answer!.includes(title));
assert.doesNotMatch(answer!,/0 (?:actions?|sonuç)/i);
assert.match(answer!,/Total matching: \*\*8\*\*/);
const guard=renderCanonicalWorkspaceAnswer('List actions',[
  fakeExecution('list_actions',{error:'forbidden',message:'denied'}),
]);
assert.equal(guard,null,'Never render a tool error as an empty workspace');
const partial=renderCanonicalWorkspaceAnswer('List actions',[
  fakeExecution('list_actions',{total:null,partialScan:true,actions:[]}),
]);
assert.match(partial??'',/cannot verify a zero result/);

const knowledge=renderCanonicalWorkspaceAnswer('son yaptıklarımı özetle, son notlarımı!',[
  fakeExecution('get_recent_workspace',{
    focus:'all',partialScan:false,
    latestActions:[{title:'Tech Stacks',processName:'Delta Marine',updatedAt:'2026-11-11T07:00:00Z'}],
    latestNotes:[{title:'Cocoindex Notları',actionTitle:'YHT',updatedAt:'2026-11-10T12:00:00Z',preview:'Cocoindex indexleme deneyimim'}],
  }),
]);
assert.match(knowledge??'',/Tech Stacks/);
assert.match(knowledge??'',/Cocoindex Notları/);
assert.match(knowledge??'',/son güncellenen kayıtlar/i);
assert.match(renderCanonicalWorkspaceAnswer('Show latest notes',[
  fakeExecution('get_recent_workspace',{focus:'notes',latestActions:[],latestNotes:[],partialScan:true}),
])??'',/bounded and not an exhaustive history/);

const registry=readFileSync('lib/ai/agent/read-tools.ts','utf8');
assert.match(registry,/canReadScopedAction/);
assert.match(registry,/readVisibleActions/);
assert.match(registry,/get_recent_workspace:recentWorkspaceSchema/);
assert.match(registry,/runRecentWorkspace/);
assert.match(registry,/\.eq\('organization_id',actor\.organizationId\)/);
assert.match(registry,/\.in\('project_id',candidateProjects\.slice/);
assert.match(registry,/\.is\('project_id',null\)\.in\('team_id'/);
assert.match(registry,/previewTextFromTipTap\(note\.content/);
assert.doesNotMatch(registry,/\.insert\(|\.update\(|\.delete\(/);
const route=readFileSync('app/api/ai/chat/route.ts','utf8');
assert.match(route,/renderCanonicalWorkspaceAnswer\(input.message,readToolExecutions\)/);
assert.match(route,/actiproc-canonical-read/);
assert.match(route,/actiproc-read-tools-disabled/);
assert.match(route,/failedSelectionRead/);
assert.match(route,/AIReadToolError/);
assert.match(route,/areAIReadToolsEnabled/);
assert.match(route,/reserveAIQuota/);
const client=readFileSync('components/ai/AxiomAIChat.tsx','utf8');
assert.match(client,/retryAssistantMessageId/);
assert.match(client,/errorCode:event.code/);

console.log(JSON.stringify({
  suite:'actiproc-ai-workspace-grounding',status:'passed',
  screenshotReproductions:4,accessGuards:7,liveProviderCalls:false,liveDatabaseCalls:false,
}));
