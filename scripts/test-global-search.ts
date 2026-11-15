import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  searchAuthorizedRows,normalizeSearchText,type SearchData
} from '../lib/search/global-search';

const org='org-a';
const tasks=[
  {id:'task-1',title:'Launch plan',description:'Prepare the final checklist',team_id:'team-1',organization_id:org,project_id:'public-1',
    checklist_blocks:{type:'doc',content:[{type:'taskItem',attrs:{id:'check-1'},content:[{type:'text',text:'Review release criteria'}]}]}},
  {id:'task-2',title:'Private payroll',description:'salary of company',team_id:'team-1',organization_id:org,project_id:'private-2',
    checklist_blocks:{type:'doc',content:[{type:'taskItem',attrs:{id:'check-secret'},content:[{type:'text',text:'Confidential salary'}]}]}},
  {id:'task-3',title:'Other team secrets',team_id:'team-2',organization_id:org,project_id:null,description:'private secret'},
  {id:'task-4',title:'External tenant action',team_id:'team-1',organization_id:'org-b',project_id:null},
  {id:'task-5',title:'Standalone Action',team_id:'team-1',organization_id:org,project_id:null}
];
const data:SearchData={
  projects:[
    {id:'public-1',name:'Marketing launch',team_id:'team-1',organization_id:org},
    {id:'private-2',name:'Private payroll',team_id:'team-1',organization_id:org},
    {id:'other-3',name:'Other company',team_id:'team-2',organization_id:org},
  ],
  tasks,
  teams:[
    {id:'team-1',name:'Product team',organization_id:org},
    {id:'team-2',name:'Secret team',organization_id:org},
  ],
  customers:[{id:'customer-1',name:'İstanbul Teknoloji',email:'info@example.test',organization_id:org},
    {id:'customer-2',name:'Other tenant',organization_id:'org-b'}],
  notes:[
    {id:'note-1',title:'Release decisions',team_id:'team-1',organization_id:org,task_id:'task-1',
      content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Keep the launch checklist ready'}]}]}},
    {id:'note-2',title:'Hidden payroll notes',team_id:'team-1',organization_id:org,task_id:'task-2',
      content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Salaries'}]}]}},
    {id:'note-3',title:'Wrong org',team_id:'team-1',organization_id:'org-b',task_id:'task-1',
      content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'sensitive'}]}]}},
    {id:'note-4',title:'Hidden link',team_id:'team-2',organization_id:org,task_id:'task-1'},
  ],
};
const scope={organizationId:org,teamIds:new Set(['team-1']),projectIds:new Set(['public-1'])};
const lookup=(query:string)=>searchAuthorizedRows(data,scope,query,48);
assert.equal(normalizeSearchText('İŞ Işığı Çağrı'),'is isigi cagri');
assert.deepEqual(lookup('launch').map(x=>x.kind+':'+x.id).sort(),['action:task-1','note:note-1','process:public-1'].sort());
const note=lookup('decisions')[0];assert.equal(note.kind,'note');assert.equal(note.noteId,'note-1');assert.equal(note.taskId,'task-1');
assert.deepEqual(lookup('criteria').map(x=>x.id),['check-1']);
assert.equal(lookup('criteria')[0]?.checklistId,'check-1');
assert.ok(lookup('istanbul').some(x=>x.kind==='customer'&&x.id==='customer-1'));
assert.equal(lookup('payroll').length,0,'private Project and related Action/Note must not leak');
assert.equal(lookup('salary').length,0,'private Checklist must not leak');
assert.equal(lookup('secret').length,0,'other team must not leak');
assert.equal(lookup('external tenant').length,0,'other org must not leak');
assert.equal(lookup('sensitive').length,0,'cross-org Note must not leak');
assert.equal(lookup('standalone').length,1,'General Action in authorized team stays discoverable');
assert.equal(lookup('a').length,0,'1-char searches blocked');
assert.equal(lookup('launch').length<=48,true);
assert.equal(searchAuthorizedRows(data,{...scope,projectIds:new Set()},'payroll').length,0);
assert.equal(searchAuthorizedRows(data,{...scope,teamIds:new Set()},'istanbul').length,1,'customer visibility is organization-wide, matching existing customer API');

const src=(path:string)=>readFileSync(path,'utf8');
const api=src('app/api/search/route.ts');
const palette=src('components/search/GlobalCommandPalette.tsx');
const header=src('components/Header.tsx');
assert.match(api,/requireAuthedUser\(request\)/);
assert.match(api,/getVisibleForUser/);
assert.match(api,/isOrgAdmin\(authed\.user\)/);
assert.match(api,/authorized\.has\(selectedTeamId\)/);
assert.match(api,/projectIds/);
assert.match(api,/team_id.*teamIds/);
assert.match(api,/Cache-Control.*private, no-store/);
assert.match(api,/Rate|RATE_MAX/);
assert.match(api,/\/\*.*server-side, ACL-enforced search/);
assert.doesNotMatch(api,/console\.log\(query/);
assert.match(header,/event\.ctrlKey\|\|event\.metaKey/);
assert.match(header,/event\.shiftKey/);
assert.match(header,/Search everything/);
assert.match(palette,/Command shouldFilter=\{false\} loop/);
assert.match(palette,/AbortController/);
assert.match(palette,/setTimeout\(async/);
assert.match(palette,/onSelect=\{\(\)=>go\(item\)\}/);
assert.match(palette,/aria-label=\{t\("Search team scope"\)\}/);
assert.match(palette,/Search Actions, notes, checklists, Processes/);
assert.match(src('components/Customers.tsx'),/requestedCustomer===customer\.id/);
console.log('Global search ACL, Turkish match, rich content, deep links and shortcuts contract passed');
