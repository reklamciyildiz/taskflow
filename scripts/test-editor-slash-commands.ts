import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Highlight from '@tiptap/extension-highlight';
import { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  applyChecklistSlashCommand,
  filteredSlashCommands,
  type ChecklistSlashMenuState,
} from '../components/editor/BlockEditor';
import { AdvancedTaskItem } from '../components/editor/extensions/AdvancedTaskItem';

const schema = getSchema([
  StarterKit,
  Highlight.configure({ multicolor: true }),
  TaskList,
  AdvancedTaskItem.configure({ nested: true }),
]);

function apply(
  json: Record<string, unknown>,
  menu: ChecklistSlashMenuState,
  command: Parameters<typeof applyChecklistSlashCommand>[2],
) {
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(json) });
  const view = {
    get state() {
      return state;
    },
    dispatch(transaction: typeof state.tr) {
      state = state.apply(transaction);
    },
    focus() {},
  } as unknown as EditorView;
  assert.equal(applyChecklistSlashCommand(view, menu, command), true);
  return state;
}

const documentMenu: ChecklistSlashMenuState = {
  blockFrom: 0,
  blockTo: 3,
  from: 1,
  to: 2,
  query: '',
  hasTrailingContent: false,
  selectedIndex: 0,
  left: 0,
  top: 0,
  context: 'document',
};

for (const [command, expectedType] of [
  ['bulletList', 'bulletList'],
  ['orderedList', 'orderedList'],
] as const) {
  const state = apply(
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '/' }] }] },
    documentMenu,
    command,
  );
  assert.equal(state.doc.firstChild?.type.name, expectedType);
  assert.equal(state.doc.firstChild?.firstChild?.type.name, 'listItem');
  assert.equal(state.doc.textContent, '');

  // TipTap JSON round-trip proves the semantic list survives save/reload.
  const persisted = state.doc.toJSON();
  assert.deepEqual(schema.nodeFromJSON(persisted).toJSON(), persisted);
}

const checklistItemMenu: ChecklistSlashMenuState = {
  blockFrom: 2,
  blockTo: 5,
  from: 3,
  to: 4,
  query: '',
  hasTrailingContent: false,
  selectedIndex: 0,
  left: 0,
  top: 0,
  context: 'checklistItem',
};
const checklistState = apply(
  {
    type: 'doc',
    content: [{
      type: 'taskList',
      content: [{
        type: 'taskItem',
        attrs: { checked: false, id: 'stable-item-1' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '/' }] }],
      }],
    }],
  },
  checklistItemMenu,
  'bold',
);
assert.equal(checklistState.doc.firstChild?.firstChild?.attrs.id, 'stable-item-1');
assert.equal(checklistState.doc.firstChild?.firstChild?.attrs.checked, false);
assert.equal(checklistState.doc.textContent, '');
assert.equal(checklistState.storedMarks?.some((mark) => mark.type.name === 'bold'), true);
const typedChecklistState = checklistState.apply(checklistState.tr.insertText('Persistent text'));
const persistedChecklist = typedChecklistState.doc.toJSON();
assert.equal(
  persistedChecklist.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.marks?.[0]?.type,
  'bold',
);
assert.deepEqual(schema.nodeFromJSON(persistedChecklist).toJSON(), persistedChecklist);

const checklistCommands = filteredSlashCommands('', false, 'checklistItem').map(({ id }) => id);
assert.deepEqual(checklistCommands, ['bold', 'italic', 'underline', 'strike', 'code', 'highlight']);
assert.equal(checklistCommands.includes('bulletList' as never), false);
assert.equal(filteredSlashCommands('number', false, 'document')[0]?.id, 'orderedList');

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
const editor = readFileSync(resolve(process.cwd(), 'components/editor/BlockEditor.tsx'), 'utf8');
assert.match(css, /\.tiptap ul:not\(\[data-type="taskList"\]\)[\s\S]*list-style-type: disc/);
assert.match(css, /\.tiptap ol[\s\S]*list-style-type: decimal/);
assert.doesNotMatch(editor, /marker:text-transparent/);

console.log(JSON.stringify({
  semanticListRoundTrips: 2,
  checklistStableIdPreserved: true,
  checklistCommands,
  listMarkersVisible: true,
}));
