import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeBoardDropPatches, orderedColumnTasks } from '../lib/board-reorder';
import { isTerminalBoardColumn, type Task, type ProjectColumnConfig } from '../lib/types';

const read = (path: string) => readFileSync(path, 'utf8');
const board = read('components/TaskBoard.tsx');
const card = read('components/TaskCard.tsx');
const grouped = read('components/PropertyBoard.tsx');
const process = read('components/ProcessSwitcher.tsx');
const browserQA = read('scripts/test-board-table-browser.cjs');

for (const [file, source, required] of [
  ['TaskBoard', board, ['Workspace', 'Projects &amp; Board', 'filteredTasks.length',
    'progressPercent', 'DragDropContext onDragEnd={onDragEnd}', 'Droppable droppableId={column.id}',
    'provided.innerRef', 'drag.innerRef', 'provided.placeholder', 'onDragEnd',
    'isDragDisabled={isMobileBoard}', 'snapshot.isDraggingOver', 'aria-label="Board actions"',
    'canCompleteTask', 'canEditTask', 'permissions.canCreateTask',
    'statusFilter', 'customerFilter', 'onOpen={openTaskEditor}', 'isMobileBoard ?']],
  ['TaskCard', card, ['data-board-action-card={task.id}', 'aria-busy={movePending}',
    'blockCardOpenUntilRef.current', 'movePendingRef.current', 'suppressTaskEditorOpenFor',
    'onTaskClick?.(task)', 'canEdit', 'canDelete', 'canComplete',
    'isTerminalBoardColumn', 'priorityColors[task.priority]', 'priorityAccents[task.priority]',
    'DropdownMenuItem', 'updateTask(task.id, { status: col.id })',
    'focus-visible', 'group-hover', 'dragHandleProps']],
  ['PropertyBoard', grouped, ['groupActionsByProperty', 'selectedPropertyOptionsForTask',
    'onTaskClick={item => onOpen(item.id)}', 'overflow-x-auto', 'group.tasks.map',
    'No Actions in this group']],
  ['ProcessSwitcher', process, ['aria-label="Active process / project"', 'onReorder(',
    'onDragEnd', 'moveItem(projects, from, to)', 'disableInteractiveElementBlocking',
    'onValueChange(project.id)', 'getContainerForClone={() => document.body}']],
] as const) {
  for (const contract of required) {
    assert.ok(source.includes(contract), file + ': missing ' + contract);
  }
}

assert.match(board, /rounded-\[26px\]/);
assert.match(board, /rounded-\[23px\]/);
assert.match(card, /rounded-\[18px\]/);
assert.ok(board.includes('share = filteredTasks.length ? Math.round') &&
 board.includes('progressPercent = filteredTasks.length ? Math.round'),
 'Visible progress summaries must be based on actual filtered Actions');
assert.ok(board.includes('column.color ?? skin.dot'), 'Configured stage colors remain visible');
assert.ok(!board.includes("gridTemplateColumns: isMobileBoard"), 'Stage layout must avoid squeezed columns');
assert.ok(browserQA.includes('data-board-action-card') && browserQA.includes('Nothing here yet'),
 'Responsive browser regression must verify redesigned cards and mobile empty states');

const stages: ProjectColumnConfig[] = [
  { id: 'todo', title: 'Yapılacaklar', isTerminal: false },
  { id: 'done', title: 'İşimiz Bitti', isTerminal: true },
];
const tasks = [
  { id: 'a', status: 'todo', boardPosition: 0, createdAt: new Date(0) },
  { id: 'b', status: 'done', boardPosition: 0, createdAt: new Date(0) },
] as Task[];
const patch = computeBoardDropPatches(tasks, stages, {
  draggableId: 'a', source: { droppableId: 'todo', index: 0 },
  destination: { droppableId: 'done', index: 0 },
  mode: 'FLUID', combine: null, type: 'DEFAULT', reason: 'DROP',
});
assert.ok(patch);
const moved = tasks.map(task => ({ ...task, ...patch?.find(item => item.id === task.id)?.changes }));
assert.deepEqual(orderedColumnTasks(moved, 'done', stages).map(task => task.id), ['a', 'b']);
assert.equal(moved.find(task => task.id === 'a')?.status, 'done');
assert.equal(isTerminalBoardColumn('done', stages), true);

console.log('PASS: premium Board UI structure, state preservation, ACL, mobile and stable DnD reorder');
