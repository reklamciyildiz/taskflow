import { z } from 'zod';

export const PROPERTY_COLORS = ['slate', 'blue', 'green', 'amber', 'rose', 'violet'] as const;
export type PropertyColor = typeof PROPERTY_COLORS[number];
export const PROPERTY_COLOR_CLASSES: Record<PropertyColor, string> = {
  slate: 'bg-slate-400', blue: 'bg-blue-400', green: 'bg-emerald-400',
  amber: 'bg-amber-400', rose: 'bg-rose-400', violet: 'bg-violet-400',
};
export type ProcessProperty = {
  id: string; project_id: string; name: string; type: 'single_select';
  position: number; archived_at: string | null;
};
export type PropertyOption = {
  id: string; project_id: string; property_id: string; label: string; color: PropertyColor;
  position: number; archived_at: string | null;
};
export type ActionPropertyValue = { task_id: string; project_id: string; property_id: string; option_id: string };
export type ProcessPropertyData = {
  properties: ProcessProperty[]; options: PropertyOption[]; values: ActionPropertyValue[];
  canManage: boolean;
};

const uuid = z.string().uuid();
const label = z.string().trim().min(1).max(80);
// Native fields already have canonical storage/semantics. Do not duplicate them here.
const nativeNames = new Set(['priority', 'assignee', 'client', 'stage', 'schedule', 'öncelik', 'atandı', 'atanan', 'müşteri', 'aşama', 'zamanlama']);
const propertyName = label.refine(name => !nativeNames.has(name.toLocaleLowerCase('tr-TR'))
  && !nativeNames.has(name.toLowerCase()), 'Use the existing native field instead of a custom property.');
export const propertyCommandSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('create_property'), name: propertyName }).strict(),
  z.object({ operation: z.literal('rename_property'), id: uuid, name: propertyName }).strict(),
  z.object({ operation: z.literal('archive_property'), id: uuid }).strict(),
  z.object({ operation: z.literal('create_option'), propertyId: uuid, label, color: z.enum(PROPERTY_COLORS) }).strict(),
  z.object({ operation: z.literal('update_option'), id: uuid, label, color: z.enum(PROPERTY_COLORS) }).strict(),
  z.object({ operation: z.literal('archive_option'), id: uuid }).strict(),
  z.object({ operation: z.literal('reorder'), propertyId: uuid.nullable(), ids: z.array(uuid).max(1000) }).strict(),
]);
export type PropertyCommand = z.infer<typeof propertyCommandSchema>;
export const propertyValueSchema = z.object({ propertyId: uuid, optionId: uuid.nullable() }).strict();

export function orderedProperties<T extends { position: number; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Read-only projection. Never mutates Action status or the Stage board rank. */
export function groupActionsByProperty<T extends { id: string; projectId?: string | null }>(
  tasks: readonly T[], property: ProcessProperty, options: readonly PropertyOption[], values: readonly ActionPropertyValue[],
) {
  const relevant = orderedProperties(options.filter(o => o.property_id === property.id && o.project_id === property.project_id));
  const selections = new Map(values.filter(v => v.property_id === property.id && v.project_id === property.project_id).map(v => [v.task_id, v.option_id]));
  const groups = relevant.map(option => ({ id: option.id, label: option.label + (option.archived_at ? ' (archived)' : ''), color: option.color, tasks: [] as T[] }));
  const byId = new Map(groups.map(group => [group.id, group]));
  const unassigned = { id: 'unassigned', label: 'Unassigned', color: 'slate' as PropertyColor, tasks: [] as T[] };
  for (const task of tasks) {
    if (task.projectId !== property.project_id) continue;
    (byId.get(selections.get(task.id) ?? '') ?? unassigned).tasks.push(task);
  }
  return [...groups.filter(group => !relevant.find(o => o.id === group.id)?.archived_at || group.tasks.length > 0), unassigned];
}
