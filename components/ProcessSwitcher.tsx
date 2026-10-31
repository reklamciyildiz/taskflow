'use client';

import { useEffect, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { moveItem } from '@/lib/user-preferences';

type ProcessOption = { id: string; name: string };

// Historical Quick Capture could create a normal Process named Inbox. Keep
// it visible, but distinguish it from the new unassigned team Inbox.
const processLabel = (name: string) => name.trim().toLowerCase() === 'inbox'
  ? 'Inbox (legacy Process)'
  : name;

export function ProcessSwitcher({
  projects,
  value,
  onValueChange,
  onReorder,
}: {
  projects: ProcessOption[];
  value: string;
  onValueChange: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const selected = projects.find((project) => project.id === value);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      selectedRef.current?.scrollIntoView({ block: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const move = (from: number, to: number) => {
    const next = moveItem(projects, from, to);
    onReorder(next.map((project) => project.id));
  };
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    move(result.source.index, result.destination.index);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 min-w-0 flex-1 justify-between gap-2 px-3 font-normal md:h-10 sm:w-auto sm:min-w-[160px]"
          aria-label="Active process / project"
          aria-expanded={open}
        >
          <span className="truncate">{selected ? processLabel(selected.name) : 'Inbox'}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-1rem))] p-1.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <button
          type="button"
          aria-current={!value ? 'page' : undefined}
          className={cn(
            'mb-1 flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            !value && 'bg-primary/10 text-primary',
          )}
          onClick={() => {
            onValueChange('');
            setOpen(false);
          }}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            {!value ? <Check className="h-4 w-4" aria-hidden /> : null}
          </span>
          <span className="font-medium">Inbox</span>
        </button>
        <div className="mb-1 border-b border-border/60" role="separator" />
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable
            droppableId="process-order"
            getContainerForClone={() => document.body}
            renderClone={(drag, state, rubric) => {
              const project = projects[rubric.source.index];
              return (
                <div
                  ref={drag.innerRef}
                  {...drag.draggableProps}
                  className={cn(
                    'z-[500] flex min-h-10 items-center rounded-md border border-primary/35 bg-popover px-2 py-2 text-sm text-popover-foreground shadow-xl',
                    state.isDropAnimating && 'opacity-90',
                  )}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {project?.id === value ? <Check className="h-4 w-4" aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate px-2">{project ? processLabel(project.name) : ''}</span>
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              );
            }}
          >
            {(drop, snapshot) => (
              <div
                ref={drop.innerRef}
                {...drop.droppableProps}
                className={cn(
                  'max-h-[min(22rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain rounded-lg p-0.5',
                  snapshot.isDraggingOver && 'bg-muted/20',
                )}
                aria-label="Processes"
              >
                {projects.map((project, index) => (
                  <Draggable
                    key={project.id}
                    draggableId={project.id}
                    index={index}
                    disableInteractiveElementBlocking
                  >
                    {(drag, state) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={cn(
                          'group mb-0.5 flex min-h-10 items-center rounded-md border border-transparent bg-popover transition-[background-color,border-color,box-shadow] last:mb-0',
                          state.isDragging && 'z-[460] border-primary/35 bg-popover shadow-lg',
                        )}
                      >
                        <button
                          ref={project.id === value ? selectedRef : undefined}
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          onClick={() => {
                            onValueChange(project.id);
                            setOpen(false);
                          }}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            {project.id === value ? <Check className="h-4 w-4" aria-hidden /> : null}
                          </span>
                          <span className="truncate">{processLabel(project.name)}</span>
                        </button>
                        <div className="mr-1 flex shrink-0 items-center">
                          <button
                            type="button"
                            className="inline-flex h-8 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-25 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                            aria-label={`Move ${project.name} up`}
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                          >
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-25 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                            aria-label={`Move ${project.name} down`}
                            disabled={index === projects.length - 1}
                            onClick={() => move(index, index + 1)}
                          >
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            {...drag.dragHandleProps}
                            className="inline-flex h-8 w-8 touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                            aria-label={`Reorder ${project.name}`}
                            title="Drag to reorder. Keyboard: Space, Arrow keys, Space."
                          >
                            <GripVertical className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {drop.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </PopoverContent>
    </Popover>
  );
}
