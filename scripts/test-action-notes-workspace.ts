import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexActionNotes, noteTitle, selectActionNotes } from '../lib/action-note-collection';
import type { Note } from '../lib/types';

function makeNote(id: string, fields: Partial<Note>): Note {
  return {
    id, taskId:'task-a', organizationId:'org-a', teamId:'team-a',
    authorId:'author-a', authorName:'Derya',
    title:'', type:'note', content:{type:'doc',content:[]},
    createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    ...fields,
  };
}

const notes: Note[] = [
  makeNote('idea', {
    title:'İş Akışı', type:'idea', authorName:'Yiğit',
    updatedAt:'2026-11-05T12:00:00Z',createdAt:'2026-11-01T00:00:00Z',
    content:{type:'doc',content:[
      {type:'heading',content:[{type:'text',text:'Premium onboarding'}]},
      {type:'paragraph',content:[{type:'text',text:'Ekip süreçleri için hızlı erişim'}]},
    ]},
  }),
  makeNote('learning', {
    title:'API design', type:'learning',
    updatedAt:'2026-11-04T12:00:00Z',createdAt:'2026-11-03T00:00:00Z',
    content:{type:'doc',content:[{type:'codeBlock',content:[{type:'text',text:'const server = 42'}]}]},
  }),
  makeNote('decision', {
    title:'Roadmap',type:'decision',
    updatedAt:'2026-10-12T00:00:00Z',createdAt:'2026-11-04T00:00:00Z',
    content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Ongoing customer requests'}]}]},
  }),
  makeNote('empty', { title:'', updatedAt:'invalid date' }),
];

const indexed = indexActionNotes(notes);
const ids = (x: typeof indexed) => x.map(item=>item.note.id);
let checks=0;
assert.equal(indexed.length,4);
assert.deepEqual(ids(selectActionNotes(indexed,'','all','updated')),['idea','learning','decision','empty']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'','all','oldest')),['empty','decision','learning','idea']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'','all','created')),['decision','learning','idea','empty']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'','all','title')),['learning','idea','decision','empty']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'premium','all','updated')),['idea']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'ekip surecleri','all','updated')),['idea']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'IS AKISI','all','updated')),['idea']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'server 42','learning','updated')),['learning']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'server 42','idea','updated')),[]);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'yigit','all','updated')),['idea']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'customer   requests','all','updated')),['decision']);checks++;
assert.deepEqual(ids(selectActionNotes(indexed,'','idea','updated')),['idea']);checks++;
assert.equal(indexed.find(item=>item.note.id==='idea')?.preview,'Premium onboarding Ekip süreçleri için hızlı erişim');checks++;
assert.equal(noteTitle(notes[3]),'Untitled note');checks++;
assert.equal(notes[0].content.content[0].content[0].text,'Premium onboarding','Search must not mutate rich TipTap JSON');checks++;
const widget=readFileSync('components/action/ActionNotes.tsx','utf8');
for(const marker of [
  'aria-label="Action notes navigator"','aria-label="Search action notes"',
  'aria-label="Filter note type"','aria-label="Sort notes"',
  'aria-label="Compact note list"','aria-label="Note cards"',
  'Show more (','aria-label="Note editor"','noteApi.create(taskId',
  'onTrackSave','const editorKey = draft?.clientId ?? selectedNote!.id',
  'persistNow();','focusedNoteId','<BlockEditor',
]) { assert.ok(widget.includes(marker),'Missing ActionNotes contract '+marker);checks++; }
assert.ok(widget.includes('editorPanel ? "hidden lg:flex" : "flex"'),
  'Mobile should render one focused pane, desktop can keep note navigator');
assert.ok(widget.includes('lg:grid-cols-[minmax(245px,290px)_minmax(0,1fr)]'),
  'Desktop should preserve direct note navigation when editing');
assert.ok(!widget.includes('notes.map((note) => {'),'Legacy unsearchable card list should be removed');
checks+=3;
console.log(JSON.stringify({actionNotesChecks:checks,search:'rich title/body/author',mobile:true,desktopSplit:true,paginated:true}));
