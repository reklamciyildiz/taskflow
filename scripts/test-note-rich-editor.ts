import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { PremiumCodeBlock } from '../components/editor/extensions/PremiumCodeBlock';
import { applyChecklistSlashCommand, type ChecklistSlashMenuState } from '../components/editor/BlockEditor';
import {
  detectCodeLanguage, normalizeCodeLanguage, parseRichNoteClipboard,
} from '../components/editor/rich-paste';

const schema = getSchema([StarterKit.configure({ codeBlock: false }), PremiumCodeBlock]);
let checks = 0;
const python = 'def greeting(name):\n    print(f"Hello {name}")\n    return name\n';
const json = '{\n  "name": "Actiproc",\n  "enabled": true\n}';
const markdown = [
  '## Setup guide',
  '',
  'Use **Python** in the following block:',
  '',
  '~~~python',
  python.trimEnd(),
  '~~~',
  '',
  '- First step',
  '- Second step',
].join('\n');
const pasted = parseRichNoteClipboard(markdown);
assert.ok(pasted);
assert.equal(pasted[0].type, 'heading');
assert.equal(pasted[0].attrs?.level, 2);
const code = pasted.find(item => item.type === 'codeBlock');
assert.ok(code);
assert.equal(code.attrs?.language, 'python');
assert.equal(code.content?.[0]?.text, python.trimEnd());
assert.equal(pasted.at(-1)?.type, 'bulletList');
checks += 6;

const wrapped = { type: 'doc', content: pasted };
const serialized = schema.nodeFromJSON(wrapped).toJSON();
assert.deepEqual(schema.nodeFromJSON(serialized).toJSON(), serialized);
assert.ok(serialized.content.some((node: { type?: string }) => node.type === 'codeBlock'));
checks += 2;

const codeSources = [
  ['const greet = (name) => {\n  return "Hello " + name;\n};', 'javascript'],
  [python, 'python'],
  [json, 'json'],
  ['SELECT id, email\nFROM members\nWHERE active = true;', 'sql'],
  ['using System;\nnamespace Demo {\n class App {}\n}', 'csharp'],
] as const;
for (const [source, language] of codeSources) {
  assert.equal(detectCodeLanguage(source), language);
  const result = parseRichNoteClipboard(source);
  assert.equal(result?.[0]?.type, 'codeBlock');
  assert.equal(result?.[0]?.content?.[0]?.text, source);
  assert.equal(result?.[0]?.attrs?.language, language);
  checks += 4;
}
assert.equal(parseRichNoteClipboard('A normal paragraph\nwith another line'), null);
assert.equal(parseRichNoteClipboard('single line'), null);
assert.equal(parseRichNoteClipboard('A work note\n\nwithout any special syntax.'), null);
assert.equal(normalizeCodeLanguage('language-ts'), 'typescript');
assert.equal(normalizeCodeLanguage('py'), 'python');
assert.equal(normalizeCodeLanguage('unexpected " onclick'), 'plaintext');
checks += 6;

const fenced = parseRichNoteClipboard('~~~ts\nconst x: number = 1;\n~~~');
assert.equal(fenced?.length, 1);
assert.equal(fenced?.[0]?.attrs?.language, 'typescript');
assert.equal(fenced?.[0]?.content?.[0]?.text, 'const x: number = 1;');
checks += 3;

// Slash menu: replace the placeholder paragraph with an actual editable code
// block without dropping trailing text, then serialize it through the schema.
const menu: ChecklistSlashMenuState = {
  blockFrom: 0, blockTo: 3, from: 1, to: 2, query: 'code',
  hasTrailingContent: false, selectedIndex: 0,
  left: 0, top: 0, context: 'document',
};
let state = EditorState.create({ schema, doc: schema.nodeFromJSON({
  type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '/' }] }],
}) });
const view = {
  get state() { return state; },
  dispatch(transaction: typeof state.tr) { state = state.apply(transaction); },
  focus() {},
} as unknown as EditorView;
assert.equal(applyChecklistSlashCommand(view, menu, 'codeBlock'), true);
assert.equal(state.doc.firstChild?.type.name, 'codeBlock');
assert.equal(state.doc.firstChild?.attrs.language, 'plaintext');
assert.deepEqual(schema.nodeFromJSON(state.doc.toJSON()).toJSON(), state.doc.toJSON());
checks += 4;

console.log(JSON.stringify({ noteRichEditorChecks: checks, markdownRoundTrip: true, codeLanguages: codeSources.length }));
