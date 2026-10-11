import type { Task, TaskPriority } from '@/lib/types';
import type { ActionPropertyValue, PropertyOption } from '@/lib/process-properties';

export const UNASSIGNED_FILTER = '__unassigned__';

export type OperationalTableFilters = {
  stage: string | null;
  priority: TaskPriority | null;
  assignee: string | null;
  properties: Record<string, string>;
};

export type OperationalSortField =
  | 'title'
  | 'stage'
  | 'priority'
  | 'assignee'
  | 'schedule'
  | 'client'
  | 'created'
  | `property:${string}`;

export type OperationalSort = {
  field: OperationalSortField;
  direction: 'asc' | 'desc';
};

export function propertyValuesByTask(values: readonly ActionPropertyValue[]) {
  const result = new Map<string, Map<string, string>>();
  for (const value of values) {
    const taskValues = result.get(value.task_id) ?? new Map<string, string>();
    taskValues.set(value.property_id, value.option_id);
    result.set(value.task_id, taskValues);
  }
  return result;
}

function compareNullable(left: string | number | null, right: string | number | null): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

export function filterAndSortOperationalTasks({
  tasks,
  search,
  filters,
  sort,
  values,
  options,
  stageLabels,
  assigneeLabels,
}: {
  tasks: readonly Task[];
  search: string;
  filters: OperationalTableFilters;
  sort: OperationalSort;
  values: readonly ActionPropertyValue[];
  options: readonly PropertyOption[];
  stageLabels: ReadonlyMap<string, string>;
  assigneeLabels: ReadonlyMap<string, string>;
}): Task[] {
  const selections = propertyValuesByTask(values);
  const optionLabels = new Map(options.map((option) => [option.id, option.label]));
  const query = search.trim().toLocaleLowerCase();
  const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const filtered = tasks.filter((task) => {
    if (filters.stage && task.status !== filters.stage) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.assignee) {
      if (filters.assignee === UNASSIGNED_FILTER ? !!task.assigneeId : task.assigneeId !== filters.assignee) return false;
    }
    const taskValues = selections.get(task.id);
    for (const [propertyId, optionId] of Object.entries(filters.properties)) {
      const selected = taskValues?.get(propertyId);
      if (optionId === UNASSIGNED_FILTER ? !!selected : selected !== optionId) return false;
    }
    if (!query) return true;
    const propertyText = [...(taskValues?.values() ?? [])]
      .map((optionId) => optionLabels.get(optionId) ?? '')
      .join(' ');
    return [task.title, task.description, task.customerName ?? '', propertyText]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });

  const valueFor = (task: Task): string | number | null => {
    if (sort.field.startsWith('property:')) {
      const optionId = selections.get(task.id)?.get(sort.field.slice('property:'.length));
      return optionId ? optionLabels.get(optionId) ?? null : null;
    }
    switch (sort.field) {
      case 'title': return task.title;
      case 'stage': return stageLabels.get(task.status) ?? task.status;
      case 'priority': return priorityRank[task.priority];
      case 'assignee': return task.assigneeId ? assigneeLabels.get(task.assigneeId) ?? null : null;
      case 'schedule': return task.schedule?.scheduleDate ?? null;
      case 'client': return task.customerName ?? null;
      case 'created': return task.createdAt.getTime();
    }
    return null;
  };

  return [...filtered].sort((left, right) => {
    const compared = compareNullable(valueFor(left), valueFor(right));
    if (compared !== 0) return sort.direction === 'asc' ? compared : -compared;
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }) || left.id.localeCompare(right.id);
  });
}

export function hasOperationalFilters(filters: OperationalTableFilters): boolean {
  return !!filters.stage || !!filters.priority || !!filters.assignee || Object.keys(filters.properties).length > 0;
}
