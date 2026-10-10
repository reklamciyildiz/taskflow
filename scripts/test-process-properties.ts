import assert from 'node:assert/strict';
import { groupActionsByProperty, orderedProperties, propertyCommandSchema, propertyValueSchema, type ProcessProperty, type PropertyOption } from '../lib/process-properties';
import { computeBoardDropPatches, orderedColumnTasks } from '../lib/board-reorder';
import type { Task } from '../lib/types';
const property: ProcessProperty = { id: crypto.randomUUID(), project_id: crypto.randomUUID(), name: 'Region', type: 'single_select', position: 0, archived_at: null };
const option: PropertyOption = { id: crypto.randomUUID(), project_id: property.project_id, property_id: property.id, label: 'Europe', color: 'blue', position: 0, archived_at: null };
const tasks = [
  { id: 'a', projectId: property.project_id, status: 'open', boardPosition: 9, createdAt: new Date(0) },
  { id: 'b', projectId: property.project_id, status: 'closed', boardPosition: 1, createdAt: new Date(0) },
  { id: 'foreign', projectId: 'other', status: 'open', boardPosition: 0, createdAt: new Date(0) },
] as Task[];
const values = [{ task_id: 'a', project_id: property.project_id, property_id: property.id, option_id: option.id }];
const snapshot = JSON.stringify(tasks);
const grouped = groupActionsByProperty(tasks, property, [option], values);
assert.deepEqual(grouped.map(group => group.tasks.map(t => t.id)), [['a'], ['b']]);
assert.equal(JSON.stringify(tasks), snapshot);
const renamed = groupActionsByProperty(tasks, { ...property, name: 'Area' }, [{ ...option, label: 'Avrupa' }], values);
assert.equal(renamed[0].label, 'Avrupa');
assert.equal(renamed[0].tasks[0].id, 'a');
assert.equal(groupActionsByProperty(tasks, property, [{ ...option, archived_at: '2026-10-11' }], values)[0].label, 'Europe (archived)');
assert.equal(groupActionsByProperty(tasks, property, [option], [{ ...values[0], project_id: 'other' }])[1].tasks.length, 2);
assert.equal(groupActionsByProperty(tasks, property, [option], [{ ...values[0], property_id: 'other' }])[1].tasks.length, 2);
assert.deepEqual(orderedProperties([{ id: 'b', position: 1 }, { id: 'a', position: 1 }]).map(r => r.id), ['a', 'b']);
const columns = [{ id: 'open', title: 'Open' }, { id: 'closed', title: 'Closed', isTerminal: true }];
assert.deepEqual(orderedColumnTasks(tasks.slice(0, 2), 'open', columns).map(t => [t.id, t.boardPosition]), [['a', 9]]);
const patches = computeBoardDropPatches(tasks.slice(0, 2), columns, { draggableId: 'a', type: 'DEFAULT', mode: 'FLUID', reason: 'DROP', combine: null,
  source: { droppableId: 'open', index: 0 }, destination: { droppableId: 'closed', index: 0 } });
assert.equal(patches?.find(p => p.id === 'a')?.changes.status, 'closed');
assert.equal(JSON.stringify(tasks), snapshot);
assert.equal(propertyCommandSchema.safeParse({ operation: 'create_property', name: 'Priority' }).success, false);
assert.equal(propertyCommandSchema.safeParse({ operation: 'create_property', name: 'Application Status' }).success, true);
assert.equal(propertyCommandSchema.safeParse({ operation: 'update_option', id: option.id, label: 'Avrupa', color: 'blue', project_id: 'injected' }).success, false);
assert.equal(propertyValueSchema.safeParse({ propertyId: property.id, optionId: null }).success, true);
assert.equal(propertyValueSchema.safeParse({ propertyId: property.id, optionId: option.id, status: 'done' }).success, false);
console.log('Process property validation/grouping/identity and Stage-board isolation tests passed.');
