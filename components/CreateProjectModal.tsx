'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTaskContext } from '@/components/TaskContext';
import { FALLBACK_BOARD_COLUMNS, type ProjectColumnConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Layers, CheckCircle2, Trash2, GripVertical } from 'lucide-react';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  mode?: 'create' | 'edit';
  projectId?: string | null;
}

const PRESETS: { id: string; name: string; columns: ProjectColumnConfig[] }[] = [
  { id: 'default', name: 'Simple (To Do → In Progress → Done)', columns: FALLBACK_BOARD_COLUMNS },
  {
    id: 'blank',
    name: 'Start from scratch (blank)',
    columns: [],
  },
  {
    id: 'job-search',
    name: 'Job search (Applied → Interview → Offer → Hired)',
    columns: [
      { id: 'applied', title: 'Applied', color: 'bg-slate-100 dark:bg-slate-800' },
      { id: 'interview', title: 'Interview', color: 'bg-blue-50 dark:bg-blue-500/10' },
      { id: 'offer', title: 'Offer', color: 'bg-amber-50 dark:bg-amber-500/10' },
      { id: 'hired', title: 'Hired', color: 'bg-emerald-50 dark:bg-emerald-500/10', isTerminal: true },
    ],
  },
];

const COLUMN_COLOR_OPTIONS: { id: string; label: string; className: string }[] = [
  { id: 'slate', label: 'Slate', className: 'bg-slate-50 dark:bg-slate-900/40' },
  { id: 'blue', label: 'Blue', className: 'bg-blue-50 dark:bg-blue-500/10' },
  { id: 'amber', label: 'Amber', className: 'bg-amber-50 dark:bg-amber-500/10' },
  { id: 'emerald', label: 'Emerald', className: 'bg-emerald-50 dark:bg-emerald-500/10' },
  { id: 'rose', label: 'Rose', className: 'bg-rose-50 dark:bg-rose-500/10' },
];

export function CreateProjectModal({ open, onClose, mode = 'create', projectId }: CreateProjectModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { organizationId, teams, currentTeam, refreshData, projects } = useTaskContext();
  const editingProject = useMemo(
    () => (mode === 'edit' && projectId ? projects.find((p) => p.id === projectId) ?? null : null),
    [mode, projectId, projects]
  );
  const [name, setName] = useState(() => editingProject?.name ?? '');
  const [teamId, setTeamId] = useState<string>(() => {
    if (editingProject?.teamId) return editingProject.teamId;
    return '__current__';
  });
  const [presetId, setPresetId] = useState<string>(editingProject ? 'custom' : 'default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnsDraft, setColumnsDraft] = useState<ProjectColumnConfig[]>(
    () =>
      editingProject?.columnConfig?.length
        ? editingProject.columnConfig.map((c) => ({ ...c }))
        : PRESETS[0]?.columns.map((c) => ({ ...c })) ?? FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c }))
  );

  const effectiveTeamId = useMemo(() => {
    if (teamId === '__none__') return null;
    if (teamId === '__current__') return currentTeam?.id ?? null;
    return teamId;
  }, [teamId, currentTeam?.id]);

  const handlePresetChange = (value: string) => {
    if (mode === 'edit') {
      // In edit mode, preset is informational only; we keep existing draft.
      setPresetId(value);
      return;
    }
    setPresetId(value);
    const preset = PRESETS.find((p) => p.id === value);
    const base = preset ? preset.columns : FALLBACK_BOARD_COLUMNS;
    // Copy so edits do not mutate preset definitions
    setColumnsDraft(base.map((c) => ({ ...c })));
  };

  const handleColumnTitleChange = (index: number, title: string) => {
    setColumnsDraft((prev) =>
      prev.map((col, i) => (i === index ? { ...col, title } : col))
    );
  };

  const handleToggleTerminal = (index: number) => {
    setColumnsDraft((prev) =>
      prev.map((col, i) => ({ ...col, isTerminal: i === index }))
    );
  };

  const handleToggleInclude = (index: number, checked: boolean) => {
    if (checked) {
      // Re-enable a placeholder column (no-op for now, kept for potential future states)
      return;
    }
    setColumnsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddColumn = () => {
    setColumnsDraft((prev) => [
      ...prev,
      {
        id: `col-${Date.now()}`,
        title: `Stage ${prev.length + 1}`,
        color: 'bg-slate-50 dark:bg-slate-900/40',
        isTerminal: prev.length === 0, // first column cannot be terminal in practice, but mark if single
      },
    ]);
  };

  const handleColorChange = (index: number, colorClass: string) => {
    setColumnsDraft((prev) =>
      prev.map((col, i) => (i === index ? { ...col, color: colorClass } : col))
    );
  };

  const normalizedColumns = useMemo(() => {
    const nonEmpty = columnsDraft
      .map((c) => ({ ...c, title: (c.title ?? '').trim() }))
      .filter((c) => c.title.length > 0);

    if (nonEmpty.length === 0) return [];

    // Ensure at least one terminal column; if none selected, mark last as terminal.
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
      while (usedIds.has(id)) {
        id = `${base || `col-${index + 1}`}-${counter++}`;
      }
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

    if (!organizationId) {
      setError('Organization not found (session/profile may not be loaded).');
      return;
    }
    if (!name.trim()) return;

    setLoading(true);
    try {
      const finalColumns = normalizedColumns;

      if (finalColumns.length === 0) {
        setError('Add at least one column.');
        setLoading(false);
        return;
      }

      const payload = {
        organizationId,
        name: name.trim(),
        teamId: effectiveTeamId,
        columnConfig: finalColumns,
      };

      const res = await fetch(
        mode === 'edit' && editingProject
          ? `/api/projects/${editingProject.id}`
          : '/api/projects',
        {
          method: mode === 'edit' && editingProject ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data?.success)
        throw new Error(
          data?.error || (mode === 'edit' ? 'Process update failed' : 'Process creation failed')
        );
      const createdId = (data?.data as { id?: string } | undefined)?.id;

      if (mode === 'create') {
        setName('');
        setPresetId('default');
        setColumnsDraft(
          PRESETS[0]?.columns.map((c) => ({ ...c })) ?? FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c }))
        );
        setTeamId('__current__');
      }
      onClose();
      await refreshData();

      // Auto-select (or keep selected) process on the current page by writing ?project=<id>.
      // TaskContext already syncs currentProject from the URL once projects load.
      if (createdId && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        params.set('project', createdId);
        const q = params.toString();
        const target = q ? `${pathname}?${q}` : pathname;
        router.replace(target, { scroll: false });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Process creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {mode === 'edit' ? 'Edit process' : 'Create new process'}
          </DialogTitle>
          <DialogDescription>
            Processes define the board’s columns. Select a process on the board to link actions to that flow, and
            update the column structure here anytime.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Process name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Job search, TaskFlow development…"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Team (optional)</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__current__">Current team ({currentTeam?.name ?? 'none selected'})</SelectItem>
                <SelectItem value="__none__">Not tied to a team</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{mode === 'edit' ? 'Template' : 'Starter template'}</Label>
              <Select value={presetId} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mode === 'edit'
                  ? 'You can edit the current columns below; choosing a template only affects the initial structure.'
                  : 'After choosing a template, you can rename columns, add new columns, or remove them. The last column is treated as “Done” by default; you can also mark a different column as the terminal state.'}
              </p>
            </div>

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
                  if (
                    destination.droppableId === source.droppableId &&
                    destination.index === source.index
                  ) {
                    return;
                  }
                  if (destination.droppableId !== 'columns' || source.droppableId !== 'columns') return;
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
                          No columns yet. Choose “Start from scratch (blank)” above, then add as many columns as you
                          want here.
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
                                <span
                                  className="cursor-grab text-muted-foreground/70"
                                  {...draggableProvided.dragHandleProps}
                                >
                                  <GripVertical className="h-4 w-4" aria-hidden />
                                </span>
                                <Input
                                  value={col.title}
                                  onChange={(e) => handleColumnTitleChange(index, e.target.value)}
                                  placeholder={`Column ${index + 1}`}
                                  className="h-9 w-full sm:flex-1"
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                  {COLUMN_COLOR_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => handleColorChange(index, opt.className)}
                                      className={cn(
                                        'h-4 w-4 rounded-full border border-border/60',
                                        opt.className,
                                        col.color === opt.className &&
                                          'ring-2 ring-offset-1 ring-primary ring-offset-background'
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
                                    className="h-8 px-2 gap-1"
                                    onClick={() => handleToggleTerminal(index)}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="text-xs">Done</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleToggleInclude(index, false)}
                                    disabled={columnsDraft.length <= 1}
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

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Board preview</Label>
              <div className="rounded-md border bg-gradient-to-r from-slate-50 via-muted to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 p-3">
                {normalizedColumns.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No columns yet. Once you add at least one column, you’ll see a preview here.
                  </p>
                ) : (
                  <div className="grid gap-2 min-h-[56px] grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                    {normalizedColumns.map((col) => (
                      <div
                        key={col.id}
                        className={cn(
                          'flex min-w-0 flex-col items-center justify-center rounded-xl px-3 py-2 text-xs shadow-sm border border-border/70',
                          col.color ?? 'bg-background'
                        )}
                      >
                        <span className="font-medium truncate max-w-full">{col.title}</span>
                        {col.isTerminal && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Done
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col-reverse gap-2 justify-end sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Creating…' : 'Create process'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

