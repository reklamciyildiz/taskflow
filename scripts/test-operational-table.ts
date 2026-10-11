import assert from 'node:assert/strict';
import {
  filterAndSortOperationalTasks,
  UNASSIGNED_FILTER,
  type OperationalTableFilters,
} from '../lib/operational-table';
import { selectedPropertyOptionsForTask, type ProcessPropertyData } from '../lib/process-properties';
import type { Task } from '../lib/types';

const projectId = '10000000-0000-4000-8000-000000000001';
const regionId = '20000000-0000-4000-8000-000000000001';
const typeId = '20000000-0000-4000-8000-000000000002';
const turkeyId = '30000000-0000-4000-8000-000000000001';
const europeId = '30000000-0000-4000-8000-000000000002';
const companyId = '30000000-0000-4000-8000-000000000003';

const task = (id: string, title: string, status: string, priority: Task['priority'], assigneeId: string | null): Task => ({
  id,
  title,
  description: '',
  status,
  priority,
  assigneeId,
  teamId: 'team',
  projectId,
  boardPosition: 0,
  createdBy: 'creator',
  createdAt: new Date(`2026-10-${id === 'a' ? '01' : id === 'b' ? '02' : '03'}T12:00:00Z`),
  updatedAt: new Date('2026-10-11T12:00:00Z'),
  attachments: [],
  comments: [],
});

const tasks = [
  task('a', 'Türk Loydu', 'waiting', 'high', 'u1'),
  task('b', 'Europe Company', 'waiting', 'medium', 'u2'),
  task('c', 'Unassigned Lead', 'researching', 'urgent', null),
];
const data: ProcessPropertyData = {
  canManage: true,
  properties: [
    { id: regionId, project_id: projectId, name: 'Region', type: 'single_select', position: 0, archived_at: null },
    { id: typeId, project_id: projectId, name: 'Type', type: 'single_select', position: 1, archived_at: null },
  ],
  options: [
    { id: turkeyId, project_id: projectId, property_id: regionId, label: 'Türkiye', color: 'green', position: 0, archived_at: null },
    { id: europeId, project_id: projectId, property_id: regionId, label: 'Europe', color: 'blue', position: 1, archived_at: null },
    { id: companyId, project_id: projectId, property_id: typeId, label: 'Company', color: 'violet', position: 0, archived_at: null },
  ],
  values: [
    { task_id: 'a', project_id: projectId, property_id: regionId, option_id: turkeyId },
    { task_id: 'a', project_id: projectId, property_id: typeId, option_id: companyId },
    { task_id: 'b', project_id: projectId, property_id: regionId, option_id: europeId },
    { task_id: 'b', project_id: projectId, property_id: typeId, option_id: companyId },
  ],
};
const baseFilters: OperationalTableFilters = { stage: null, priority: null, assignee: null, properties: {} };
const run = (filters: OperationalTableFilters, search = '', field: 'title' | `property:${string}` = 'title') => filterAndSortOperationalTasks({
  tasks,
  search,
  filters,
  sort: { field, direction: 'asc' },
  values: data.values,
  options: data.options,
  stageLabels: new Map([['waiting', 'Waiting'], ['researching', 'Researching']]),
  assigneeLabels: new Map([['u1', 'Ada'], ['u2', 'Grace']]),
});

assert.deepEqual(
  run({ stage: 'waiting', priority: 'high', assignee: 'u1', properties: { [regionId]: turkeyId, [typeId]: companyId } }).map((item) => item.id),
  ['a'],
  'different filters must compose with AND semantics',
);
assert.deepEqual(run({ ...baseFilters, properties: { [regionId]: UNASSIGNED_FILTER } }).map((item) => item.id), ['c']);
assert.deepEqual(run(baseFilters, 'Türkiye').map((item) => item.id), ['a'], 'search includes visible property labels');
assert.deepEqual(run(baseFilters, '', `property:${regionId}`).map((item) => item.id), ['b', 'a', 'c'], 'property sorting is deterministic and keeps empty values last');
assert.equal(new Set(run({ ...baseFilters, properties: { [typeId]: companyId } }).map((item) => item.id)).size, 2, 'one Action cannot be duplicated by multiple matching values');
assert.deepEqual(selectedPropertyOptionsForTask('a', [regionId, typeId], data).map(({ option }) => option.label), ['Türkiye', 'Company']);

console.log('Operational table: 6 filter, sort, dedupe, and property projection checks passed.');
