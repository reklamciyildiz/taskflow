import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checklistItemExists, linkedNotesForItem, noteChecklistItemIds } from '../lib/checklist-note-links';

const item={type:'taskItem',attrs:{id:'stable-1'},content:[{type:'paragraph',content:[]}]};
const document={type:'doc',content:[{type:'taskList',content:[item]}]};
assert.equal(checklistItemExists(document,'stable-1'),true);
assert.equal(checklistItemExists(document,'nonexistent'),false);
assert.equal(checklistItemExists(null,'stable-1'),false);
assert.equal(checklistItemExists({type:'doc',content:[{type:'text',text:'stable-1'}]},'stable-1'),false);
assert.equal(checklistItemExists(document,'x'.repeat(201)),false);
assert.equal(checklistItemExists({...document,content:[{type:'taskList',content:[{...item,attrs:{id:'copied-item'}}]}]},'stable-1'),false);

const links=[
  {noteId:'note-a',checklistItemId:'stable-1',createdAt:'2026-11-09'},
  {noteId:'note-b',checklistItemId:'stable-1',createdAt:'2026-11-09'},
  {noteId:'note-a',checklistItemId:'stable-2',createdAt:'2026-11-09'},
];
assert.deepEqual(linkedNotesForItem('stable-1',[{id:'note-a'},{id:'note-b'},{id:'private'}],links).map(n=>n.id),['note-a','note-b']);
assert.deepEqual(noteChecklistItemIds('note-a',links),['stable-1','stable-2']);

const route=readFileSync('app/api/tasks/[id]/checklist-note-links/route.ts','utf8');
for(const flag of [
  'requireTaskNoteAccess(params.id,{mutate:false}',
  'requireTaskNoteAccess(params.id,{mutate:true}',
  "checklistItemExists((access.task as any).checklist_blocks",
  "String((note as any).task_id)!==params.id",
  ".eq('organization_id',String((access.task as any).organization_id))",
  ".eq('task_id',params.id)",
  ".eq('checklist_item_id',parsed.data.checklistItemId)",
])assert.ok(route.includes(flag),'Missing server ACL contract: '+flag);
assert.doesNotMatch(route,/\.upsert\(/);

const migration=readFileSync('supabase/migrations/20261109190000_connected_checklist_notes.sql','utf8');
for(const flag of [
  'ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON public.note_checklist_links FROM PUBLIC, anon, authenticated',
  'ON DELETE CASCADE',
  'note_checklist_item_exists',
  'BEFORE INSERT OR UPDATE ON public.note_checklist_links',
  'AFTER UPDATE OF checklist_blocks ON public.tasks',
  'Note and checklist must belong to the same Action',
])assert.ok(migration.includes(flag),'Missing DB invariant: '+flag);

const panel=readFileSync('components/ActionPanel.tsx','utf8');
for(const flag of [
  'ChecklistNotesContext.Provider','checklistNoteApi.getByTask',
  'checklistNoteApi.link','checklistNoteApi.unlink','ensureChecklistSaved',
  'focusLinkedChecklist','openLinkedNote',
])assert.ok(panel.includes(flag),'Missing Action Panel integration: '+flag);
const node=readFileSync('components/editor/components/TaskItemNodeView.tsx','utf8');
assert.match(node,/ChecklistNoteChip itemId=/);
const badge=readFileSync('components/action/ChecklistNotesContext.tsx','utf8');
assert.match(badge,/checklist-note-chip/);
assert.match(badge,/Linked notes/);
assert.match(badge,/Connect existing/);
assert.doesNotMatch(badge,/previewTextFromTipTap|note\.content/,'Never display the note body below checklist text');
const noteEditor=readFileSync('components/action/ActionNotes.tsx','utf8');
assert.match(noteEditor,/Related checklist items/);
assert.match(noteEditor,/Search checklist to connect/);
assert.match(noteEditor,/onOpenChecklistItem/);
console.log(JSON.stringify({suite:'connected-notes-contract',checks:31,liveDatabaseCalls:false}));
