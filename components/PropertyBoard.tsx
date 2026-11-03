'use client';
import { TaskCard } from './TaskCard';
import { Layers3, ListChecks, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupActionsByProperty, PROPERTY_COLOR_CLASSES, selectedPropertyOptionsForTask, type ProcessProperty, type ProcessPropertyData } from '@/lib/process-properties';
import type { Task } from '@/lib/types';

export function PropertyBoard({ tasks, property, data, onOpen, cardPropertyIds = [] }: {
  tasks: Task[];
  property: ProcessProperty;
  data: ProcessPropertyData;
  onOpen: (id: string) => void;
  cardPropertyIds?: string[];
}) {
  const groups = groupActionsByProperty(tasks, property, data.options, data.values);
  return (
    <section className="min-w-0 space-y-3" aria-label={`Board grouped by ${property.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/65 bg-card/65 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs font-semibold">Grouped by {property.name}</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Property values organize this view; your Process stages remain unchanged.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/65 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <Layers3 className="h-3.5 w-3.5" aria-hidden /> {groups.length} groups
        </span>
      </div>
      <div className="-mx-1 flex snap-x snap-proximity items-stretch gap-3 overflow-x-auto px-1 pb-5 pt-1 overscroll-x-contain [scrollbar-width:thin] md:gap-4">
        {groups.map((group) => {
          const percent = tasks.length ? Math.round((group.tasks.length / tasks.length) * 100) : 0;
          return (
            <section key={group.id}
              className="flex w-[min(85vw,330px)] min-w-[270px] shrink-0 snap-start flex-col overflow-hidden rounded-[23px] border border-border/65 bg-muted/[0.17] shadow-[0_16px_40px_-34px_rgba(15,23,42,0.6)] md:min-w-[292px] md:flex-[1_0_292px] xl:max-w-[440px]"
              aria-label={`${group.label}: ${group.tasks.length} Actions`}>
              <div className="flex items-center justify-between gap-3 border-b border-border/55 bg-card/70 px-4 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/55 bg-background/75">
                    <span className={cn('h-2.5 w-2.5 rounded-full', PROPERTY_COLOR_CLASSES[group.color])} />
                  </span>
                  <div className="min-w-0">
                    <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Property group</p>
                    <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em]" title={group.label}>{group.label}</h3>
                  </div>
                </div>
                <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-border/65 bg-background/80 px-2 text-xs font-semibold tabular-nums">{group.tasks.length}</span>
              </div>
              <div className="flex min-h-[208px] flex-1 flex-col gap-2.5 p-2.5 md:p-3">
                {group.tasks.map(task => (
                  <TaskCard key={task.id} task={task} onTaskClick={item => onOpen(item.id)}
                    propertyBadges={selectedPropertyOptionsForTask(task.id, cardPropertyIds.filter(id => id !== property.id), data)
                      .map(({ property: selectedProperty, option }) => ({
                        id: selectedProperty.id,
                        label: `${selectedProperty.name}: ${option.label}`,
                        colorClass: PROPERTY_COLOR_CLASSES[option.color],
                      }))} />
                ))}
                {!group.tasks.length && (
                  <div className="flex min-h-[170px] flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/65 bg-background/30 p-5 text-center">
                    <ListChecks className="h-5 w-5 text-muted-foreground/60" aria-hidden />
                    <p className="text-xs font-medium">No Actions in this group</p>
                    <p className="text-[11px] text-muted-foreground">Actions with this property value will appear here.</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/50 bg-card/35 px-4 py-2.5">
                <span className="text-[10px] font-medium text-muted-foreground">{group.tasks.length} Actions</span>
                <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{percent}% of view</span>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
