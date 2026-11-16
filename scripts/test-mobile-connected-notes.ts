import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checklistItemExists, linkedNotesForItem, noteChecklistItemIds,
} from '../lib/checklist-note-links';
import { hasTurkishAppTranslation, translateApp } from '../lib/i18n/catalog';

const source = (path:string) => readFileSync(path,'utf8');
const middleware=source('middleware.ts');
const mobileAdapter=source('mobile/src/mobile-api.ts');
const mobileApp=source('mobile/src/App.tsx');
const panel=source('components/ActionPanel.tsx');
const notes=source('components/action/ActionNotes.tsx');
const chip=source('components/action/ChecklistNotesContext.tsx');
const node=source('components/editor/components/TaskItemNodeView.tsx');
const api=source('app/api/tasks/[id]/checklist-note-links/route.ts');
const noteServer=source('lib/note-server.ts');
const noteRoute=source('app/api/notes/[id]/route.ts');
const mobileCss=source('mobile/src/mobile.css');

let verified=0;
function check(value:boolean,message:string){assert.ok(value,message);verified++;}
check(
  /^\s*\/\^\\\/api\\\/tasks\\\/\[\^\/\]\+\\\/checklist-note-links\$\/\.test\(pathname\) \|\|/m.test(middleware),
  'Mobile CORS/Bearer allowlist must include exactly the connected notes endpoint',
);
for(const statement of [
  "pathname === '/api/tasks'","/api\\/tasks",
  "pathname === '/api/knowledge'",
  "/api\\/notes",
  "mobileOriginAllowed && request.method === 'OPTIONS'",
  "request.headers.get('authorization')?.startsWith('Bearer ')",
  "'Access-Control-Allow-Headers': 'authorization,content-type'",
]){
  check(middleware.includes(statement),'Preserve mobile authentication/CORS mechanism: '+statement);
}
check(!middleware.includes("'checklist-note-links',"),'Never widen the public route prefixes');
check(mobileAdapter.includes("if (raw.startsWith('/api/')) return authenticatedFetch(raw, init)"),'Mobile adapter must send shared requests with bearer');
check(mobileAdapter.includes('Authorization: `Bearer ${accessToken}`'),'Mobile API adapter must attach device access token');
check(mobileAdapter.includes("response.status === 401"),'Mobile API must refresh expired access token');
check(mobileApp.includes('<ActionPanel task={editingTask}'),'Android must mount canonical Action Panel');
check(node.includes('<ChecklistNoteChip itemId='),'Checklist must render link trigger');
check(panel.includes('<ChecklistNotesContext.Provider'),'Checklist editor must have shared link context');
check(panel.includes('reloadNoteLinks()'),'Action panel must reload server-authoritative links on mount');
check(panel.includes('onRetryChecklistLinks={reloadNoteLinks}'),'Note tab must recover from mobile transport failures');
check(panel.includes('reloadLinks:reloadNoteLinks'),'Checklist tab must recover from mobile transport failures');
check(panel.includes('setNoteLinksError(result.error'),'Link read failure must not masquerade as no links');
check(panel.includes('checklistNoteApi.getByTask'),'Action must read links');
check(panel.includes('checklistNoteApi.link'),'Action must create links');
check(panel.includes('checklistNoteApi.unlink'),'Action must remove links without deleting notes');
check(panel.includes('ensureChecklistSaved()'),'Checklist identity must be saved before linking');
check(chip.includes("t('Link note')"),'Mobile checklist trigger must be discoverable');
check(chip.includes('context.reloadLinks'),'Checklist side must expose retry');
check(chip.includes('min-h-11'),'Checklist note picker buttons must support touch');
check(notes.includes("t('+ Link checklist')"),'Note side must have visible checklist link action');
check(notes.includes('onRetryChecklistLinks'),'Note side must have retry');
check(notes.includes('min-h-11'),'Note picker choices must support touch');
check(mobileCss.includes('.checklist-note-chip'),'Android-specific checklist link targets must be styled');
check(mobileCss.includes('min-height: 2.75rem'),'Android tap targets must meet 44px guideline');
check(mobileCss.includes('@media (pointer: coarse)'),'Android styles should not degrade mouse desktop UI');
for (const fragment of [
  "requireTaskNoteAccess(params.id,{mutate:false},undefined,request)",
  "requireTaskNoteAccess(params.id,{mutate:true},undefined,request)",
  "checklistItemExists((access.task as any).checklist_blocks",
  "String((note as any).task_id)!==params.id",
  ".eq('organization_id',String((access.task as any).organization_id))",
  ".eq('task_id',params.id)",
  ".eq('note_id',parsed.data.noteId)",
  ".eq('checklist_item_id',parsed.data.checklistItemId)",
]){
  check(api.includes(fragment),'Backend keeps tenant/Action ACL: '+fragment);
}
check(noteServer.includes('const authed = await requireAuthedUser(request)'),'Note edit authorization accepts mobile Bearer authentication');
check(noteServer.includes('    authed,\n  );'),'Note edit reuses authenticated identity in nested access guard');
check(noteRoute.includes("requireNoteAccess(params.id, { mutate: true }, request)"),'Note edit APIs pass the original mobile request');
const checklist={type:'doc',content:[{type:'taskList',content:[{type:'taskItem',attrs:{id:'a'},content:[{type:'paragraph'}]}]}]};
check(checklistItemExists(checklist,'a'),'Stable checklist ID is eligible');
check(!checklistItemExists(checklist,'b'),'Unpersisted checklist ID is never eligible');
const links=[{noteId:'n1',checklistItemId:'a',createdAt:'2026-11-16T00:00:00Z'}];
check(noteChecklistItemIds('n1',links).join(',')==='a','Notes resolve linked checklist items');
check(linkedNotesForItem('a',[{id:'n1'},{id:'n2'}],links).length===1,'Checklist resolves linked notes');
for (const key of [
  'Link note','Linked notes','Related checklist items','+ Link checklist',
  'Could not load linked notes. Try again.','Loading connections…',
  'Connect existing','Search checklist…','No linked checklist items.',
]){
  check(hasTurkishAppTranslation(key),'Missing Turkish localization: '+key);
  check(translateApp('tr',key)!==key,'Translation must differ from English: '+key);
}
console.log(JSON.stringify({suite:'mobile-connected-notes-parity',verified,
  liveDatabaseCalls:false,deviceTested:false,
  result:'PASS'}));
