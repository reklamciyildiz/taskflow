import assert from 'node:assert/strict';
import { newStageId, validateStageConfig, assertStageAssignment, assertStagesRetained, resolveActionLifecycle, resolveStageLifecycle } from '../lib/stage-lifecycle';
import { FALLBACK_BOARD_COLUMNS, resolveTaskBoardColumnId, type Task } from '../lib/types';
import { computeBoardDropPatches, orderedColumnTasks } from '../lib/board-reorder';

const openId = newStageId();
const closedId = newStageId();
const columns = validateStageConfig([
  { id: openId, title: 'Genel Notlar', color: 'bg-slate-100', isTerminal: false },
  { id: closedId, title: 'Reddedildi', isTerminal: true },
]);
assert.notEqual(newStageId(), newStageId());
const changed = validateStageConfig([{ ...columns[1], color: 'bg-red-100' }, { ...columns[0], title: 'Renamed' }]);
assert.deepEqual(changed.map(c => c.id), [closedId, openId]);
assertStageAssignment(openId, changed);
assertStagesRetained(changed, [openId]);
assert.throws(() => assertStagesRetained([columns[1]], [openId]));
assert.throws(() => assertStageAssignment(newStageId(), columns));
assert.throws(() => validateStageConfig([columns[0], columns[0]]));
for (const invalid of [null, {}, [], [{ id: '', title: 'x' }], [{ id: 'x', title: 'x', isTerminal: 'true' }]]) {
  assert.throws(() => validateStageConfig(invalid));
}
assert.equal(resolveStageLifecycle(closedId, columns).isTerminal, true);
assert.equal(resolveStageLifecycle(closedId, columns).outcome, null);
assert.equal(resolveStageLifecycle(openId, columns).isActionable, true);
assert.equal(resolveStageLifecycle('done', [{ id: 'done', title: 'Category', isTerminal: false }]).isTerminal, false);
assert.equal(resolveStageLifecycle('missing', columns).resolved, false);
assert.equal(resolveStageLifecycle(openId, [columns[0], columns[0]]).resolved, false);
assert.equal(resolveTaskBoardColumnId('orphan', columns), 'orphan');
assert.equal(resolveActionLifecycle({ projectId: 'missing', status: 'done' }, [], FALLBACK_BOARD_COLUMNS).isTerminal, false);
assert.equal(resolveActionLifecycle({ status: 'done' }, [], FALLBACK_BOARD_COLUMNS).isTerminal, true);
assert.equal(resolveActionLifecycle({ status: 'todo' }, [], FALLBACK_BOARD_COLUMNS).isActionable, true);

const tasks = [
  { id: 'a', status: openId, boardPosition: 0, createdAt: new Date(0) },
  { id: 'b', status: closedId, boardPosition: 0, createdAt: new Date(0) },
] as Task[];
const patches = computeBoardDropPatches(tasks, columns, {
  draggableId: 'a', source: { droppableId: openId, index: 0 },
  destination: { droppableId: closedId, index: 0 }, type: 'DEFAULT', reason: 'DROP', mode: 'FLUID', combine: null,
})!;
const persisted = tasks.map(task => ({ ...task, ...patches.find(p => p.id === task.id)?.changes }));
assert.deepEqual(orderedColumnTasks(persisted, closedId, changed).map(t => t.id), ['a', 'b']);
assert.equal(persisted.find(t => t.id === 'a')?.status, closedId);
console.log('Stage identity/domain regression assertions passed (including Board patch order).');
