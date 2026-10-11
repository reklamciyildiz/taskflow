'use client';
import { TaskCard } from './TaskCard';
import { Badge } from './ui/badge';
import { groupActionsByProperty, PROPERTY_COLOR_CLASSES, selectedPropertyOptionsForTask, type ProcessProperty, type ProcessPropertyData } from '@/lib/process-properties';
import type { Task } from '@/lib/types';

export function PropertyBoard({ tasks, property, data, onOpen, cardPropertyIds = [] }: { tasks: Task[]; property: ProcessProperty; data: ProcessPropertyData; onOpen: (id: string) => void; cardPropertyIds?: string[] }) {
  const groups = groupActionsByProperty(tasks, property, data.options, data.values);
  return <div>
    <p className="mb-3 text-xs text-muted-foreground">Grouped by {property.name}. Change values in Action Details; Stage order is unchanged.</p>
    <div className="flex gap-3 overflow-x-auto pb-3 md:grid md:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
      {groups.map(group => <section key={group.id} className="w-[min(88vw,300px)] shrink-0 md:w-auto">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 className="flex min-w-0 items-center gap-2 text-sm font-medium"><span className={`h-2 w-2 shrink-0 rounded-full ${PROPERTY_COLOR_CLASSES[group.color]}`} /><span className="truncate">{group.label}</span></h3><Badge variant="secondary">{group.tasks.length}</Badge></div>
        <div className="max-h-[min(72dvh,680px)] min-h-[120px] space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3">
          {group.tasks.map(task => <TaskCard key={task.id} task={task} onTaskClick={task => onOpen(task.id)}
            propertyBadges={selectedPropertyOptionsForTask(task.id, cardPropertyIds.filter(id => id !== property.id), data).map(({ property: selectedProperty, option }) => ({
              id: selectedProperty.id,
              label: `${selectedProperty.name}: ${option.label}`,
              colorClass: PROPERTY_COLOR_CLASSES[option.color],
            }))} />)}
        </div>
      </section>)}
    </div>
  </div>;
}
