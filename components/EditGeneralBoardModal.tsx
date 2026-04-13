'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTaskContext } from '@/components/TaskContext';
import { FALLBACK_BOARD_COLUMNS, type ProjectColumnConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Settings2, CheckCircle2, Trash2, GripVertical } from 'lucide-react';

interface EditGeneralBoardModalProps {
  open: boolean;
  onClose: () => void;
}

const COLUMN_COLOR_OPTIONS: { id: string; label: string; className: string }[] = [
  { id: 'slate', label: 'Slate', className: 'bg-slate-50 dark:bg-slate-900/40' },
  { id: 'blue', label: 'Blue', className: 'bg-blue-50 dark:bg-blue-500/10' },
  { id: 'amber', label: 'Amber', className: 'bg-amber-50 dark:bg-amber-500/10' },
  { id: 'emerald', label: 'Emerald', className: 'bg-emerald-50 dark:bg-emerald-500/10' },
  { id: 'rose', label: 'Rose', className: 'bg-rose-50 dark:bg-rose-500/10' },
];

export function EditGeneralBoardModal({ open, onClose }: EditGeneralBoardModalProps) {
  const { generalBoardColumns, setGeneralBoardColumns, currentTeam } = useTaskContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnsDraft, setColumnsDraft] = useState<ProjectColumnConfig[]>(
    () => (generalBoardColumns.length ? generalBoardColumns.map((c) => ({ ...c })) : FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c })))
  );

  // Keep draft in sync when opening (so edits elsewhere reflect here)
  useEffect(() => {
    if (!open) return;
    setColumnsDraft(
      generalBoardColumns.length
        ? generalBoardColumns.map((c) => ({ ...c }))
        : FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when opening
  }, [open]);

  const handleColumnTitleChange = (index: number, title: string) => {
    setColumnsDraft((prev) => prev.map((col, i) => (i === index ? { ...col, title } : col)));
  };

  const handleToggleTerminal = (index: number) => {
    setColumnsDraft((prev) => prev.map((col, i) => ({ ...col, isTerminal: i === index })));
  };

  const handleAddColumn = () => {
    setColumnsDraft((prev) => [
      ...prev,
      {
        id: `col-${Date.now()}`,
        title: `Stage ${prev.length + 1}`,
        color: 'bg-slate-50 dark:bg-slate-900/40',
        isTerminal: prev.length === 0,
      },
    ]);
  };

  const handleColorChange = (index: number, colorClass: string) => {
    setColumnsDraft((prev) => prev.map((col, i) => (i === index ? { ...col, color: colorClass } : col)));
  };

  const normalizedColumns = useMemo(() => {
    const nonEmpty = columnsDraft
      .map((c) => ({ ...c, title: (c.title ?? '').trim() }))
      .filter((c) => c.title.length > 0);

    if (nonEmpty.length === 0) return [];

    let cols = nonEmpty;
    if (!cols.some((c) => c.isTerminal)) {
      cols = cols.map((c, idx) => ({ ...c, isTerminal: idx === cols.length - 1 }));
    }

    const usedIds = new Set<string>();
    const makeId = (title: string, index: number): string => {
      const base = title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      let id = base || `col-${index + 1}`;
      let counter = 2;
      while (usedIds.has(id)) id = `${base || `col-${index + 1}`}-${counter++}`;
      usedIds.add(id);
      return id;
    };

    return cols.map((c, idx) => ({
      ...c,
      id: makeId(c.title, idx),
    }));
  }, [columnsDraft]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const finalColumns = normalizedColumns;
      if (finalColumns.length === 0) {
        setError('Add at least one column.');
        setLoading(false);
        return;
      }
      setGeneralBoardColumns(finalColumns);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Edit general action columns
          </DialogTitle>
          <DialogDescription>
            These columns apply to the “General actions” view (no process). Team: {currentTeam?.name ?? '—'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="rounded-md border bg-muted/40">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
              <span className="text-xs font-medium text-muted-foreground">Column editor</span>
              <Button type="button" size="sm" variant="outline" onClick={handleAddColumn} className="h-7 px-2 text-xs">
                + Add column
              </Button>
            </div>
            <DragDropContext
              onDragEnd={(result: DropResult) => {
                const { destination, source } = result;
                if (!destination) return;
                if (destination.droppableId !== 'columns' || source.droppableId !== 'columns') return;
                if (destination.index === source.index) return;
                setColumnsDraft((prev) => {
                  const items = [...prev];
                  const [removed] = items.splice(source.index, 1);
                  items.splice(destination.index, 0, removed);
                  return items;
                });
              }}
            >
              <Droppable droppableId="columns">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="divide-y">
                    {columnsDraft.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground">
                        No columns yet. Add a column to get started.
                      </div>
                    ) : (
                      columnsDraft.map((col, index) => (
                        <Draggable key={`${col.id}-${index}`} draggableId={`${col.id}-${index}`} index={index}>
                          {(draggableProvided) => (
                            <div
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center"
                            >
                              <span className="cursor-grab text-muted-foreground/70" {...draggableProvided.dragHandleProps}>
                                <GripVertical className="h-4 w-4" aria-hidden />
                              </span>
                              <div className="flex-1 space-y-1">
                                <Label className="sr-only">Column name</Label>
                                <Input
                                  value={col.title}
                                  onChange={(e) => handleColumnTitleChange(index, e.target.value)}
                                  placeholder={`Column ${index + 1}`}
                                  className="h-9 w-full"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {COLUMN_COLOR_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => handleColorChange(index, opt.className)}
                                    className={cn(
                                      'h-4 w-4 rounded-full border border-border/60',
                                      opt.className,
                                      col.color === opt.className && 'ring-2 ring-offset-1 ring-primary ring-offset-background'
                                    )}
                                    aria-label={`${opt.label} color`}
                                  />
                                ))}
                              </div>
                              <div className="flex items-center gap-2 sm:ml-auto">
                                <Button
                                  type="button"
                                  variant={col.isTerminal ? 'default' : 'outline'}
                                  size="sm"
                                  className="h-8 gap-2"
                                  onClick={() => handleToggleTerminal(index)}
                                  title="Terminal (done) column"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className="text-xs">{col.isTerminal ? 'Done' : 'Terminal'}</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setColumnsDraft((prev) => prev.filter((_, i) => i !== index))}
                                  title="Delete column"
                                  aria-label="Delete column"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

