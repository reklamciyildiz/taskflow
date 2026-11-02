import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildKnowledgeRetrieval,
  knowledgeMapsFromContext,
  searchKnowledgeCards,
  setChecklistItemChecked,
  normalizeKnowledgePinId,
} from '../lib/knowledge-retrieval';
import type { Note, Task, Team } from '../lib/types';

const task = {
  id: 'a-1', title: 'Research competitor pricing', teamId: 'team-1',
  projectId: 'project-1', createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-02T12:00:00Z'), status: 'in_progress',
  createdBy: 'user-1', assigneeId: 'user-1',
  checklistBlocks: { type: 'doc', content: [
    { type: 'taskList', content: [
      { type: 'taskItem', attrs: { id: 'item-1', checked: false }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Review enterprise pricing' }] },
      ] },
      { type: 'taskItem', attrs: { id: 'item-2', checked: true }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Collect market examples' }] },
      ] },
    ] },
  ] },
} as unknown as Task;
const note = {
  id: 'note-1', taskId: 'a-1', teamId: 'team-1',
  organizationId: 'org-1', type: 'decision', title: 'Pricing decision',
  authorId: 'user-1', authorName: 'Team member',
  createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-02T12:00:00.000Z',
  content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Enterprise invoices require approval.' }] },
  ] },
} as unknown as Note;
const maps = knowledgeMapsFromContext(
  [{ id: 'project-1', name: 'Actiproc product' }],
  [{ id: 'team-1', name: 'Core team', organizationId: 'org-1' }] as Team[],
);
const output = buildKnowledgeRetrieval([task], [note], maps);
assert.equal(output.cards.length, 1);
assert.equal(output.cards[0].notes.length, 1);
assert.equal(output.cards[0].checklistItems.length, 2);
assert.equal(output.cards[0].projectName, 'Actiproc product');

const hits = searchKnowledgeCards(output.cards, {
  query: 'enterprise invoices', content: 'notes', projectId: 'all',
});
assert.equal(hits.length, 1);
assert.equal(hits[0].matches.some((match) => match.sourceType === 'note'), true);
assert.equal(searchKnowledgeCards(output.cards, {
  query: 'review enterprise', content: 'checklist', projectId: 'all',
}).length, 1);
assert.equal(searchKnowledgeCards(output.cards, {
  query: '', content: 'all', projectId: '__none__',
}).length, 0);
assert.equal(searchKnowledgeCards(output.cards, {
  query: '', content: 'all', projectId: 'project-1',
}).length, 1);
const changed = setChecklistItemChecked(task.checklistBlocks, 'item-1', true);
assert.equal(changed.content[0].content[0].attrs.checked, true);
assert.equal(task.checklistBlocks.content[0].content[0].attrs.checked, false,
  'Canonical update must not mutate the previous document');
assert.equal(setChecklistItemChecked(task.checklistBlocks, 'missing-id', true), null);

assert.equal(normalizeKnowledgePinId('card-a-1'), 'card-a-1');
assert.equal(normalizeKnowledgePinId('learning-a-1'), 'card-a-1');

const view = fs.readFileSync('components/knowledge/KnowledgeHubWorkspace.tsx', 'utf8');
const adapter = fs.readFileSync('components/KnowledgeHubView.tsx', 'utf8');
const mobile = fs.readFileSync('mobile/src/MobileKnowledgeHub.tsx', 'utf8');
assert.ok(view.includes('searchKnowledgeCards(') && view.includes('projectFilter') &&
  view.includes('notesLoading') && view.includes('retryNotes') &&
  view.includes('setChecklistItemChecked(') && view.includes('canEditTask('),
  'Search, access-controlled mutation and note retries must remain available');
assert.ok(view.includes('Knowledge detail') && view.includes('Open full action') &&
  view.includes('active.notes.map') && view.includes('active.checklistItems.map'),
  'Detail reader must show complete notes and checklist items, not just card previews');
assert.ok(!view.includes('max-h-80 overflow-y-auto') &&
  !view.includes('columns-1 gap-4 [column-fill:_balance]'),
  'Knowledge card design must not regress to scroll-inside masonry');
assert.ok(view.includes('results.slice(0, visibleCount)') &&
  view.includes('Show more knowledge') &&
  view.includes('aria-pressed={selected}'),
  'Result previews must scale for large libraries and filters need pressed state');
assert.ok(view.includes('aria-label="Search Knowledge Hub"') &&
  view.includes('aria-pressed={isPinned}') &&
  view.includes('onClick={() => setActiveCardId(card.id)}'),
  'Accessible, independent card actions are required');
assert.ok(adapter.includes('KnowledgeHubWorkspace') &&
  mobile.includes('KnowledgeHubViewContent'),
  'Web and Android must share the updated presentation');
console.log('Knowledge Hub retrieval, canonical checklist, search scopes and premium workspace contracts passed');
