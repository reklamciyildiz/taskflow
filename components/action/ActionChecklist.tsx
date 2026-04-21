'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Calendar as CalendarIcon, GripVertical, UserRound, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { portalDndRowToBody } from '@/lib/dnd-body-portal';
import { ACTION_CHECKLIST_QUICK_ROW_ID } from '@/lib/action-checklist';
import type { JournalLogEntry } from '@/lib/types';

const TEXTAREA_MAX_PX = 280;
const TEXTAREA_MIN_PX = 40;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `jl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (a + b).toUpperCase() || '?';
}

function parseYmdLocal(ymd: string | null | undefined): Date | undefined {
  if (!ymd) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return undefined;
  return new Date(y, mo - 1, d);
}

function toYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isEnterLike(e: React.KeyboardEvent<HTMLElement>): boolean {
  const native = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number; which?: number };
  if (native?.isComposing) return false;
  const code = native?.keyCode ?? native?.which;
  if (e.key === 'Enter') return true;
  if (code === 13 && ['Done', 'Go', 'Next', 'Search', 'Send'].includes(e.key)) return true;
  return code === 13;
}

/** Enter = new item; Shift+Enter = new line within the item. */
function shouldCommitNewItem(e: React.KeyboardEvent<HTMLElement>): boolean {
  return isEnterLike(e) && !e.shiftKey;
}

function syncTextareaHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  const h = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_PX), TEXTAREA_MAX_PX);
  el.style.height = `${h}px`;
  el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_PX ? 'auto' : 'hidden';
}

export interface ActionChecklistProps {
  items: JournalLogEntry[];
  disabled: boolean;
  onItemsChange: (next: JournalLogEntry[]) => void;
  /** Team members shown in per-row assignee picker (current team). */
  memberOptions?: { id: string; name: string }[];
  /** If set, scroll + highlight this checklist row id (body rows only). */
  focusRowId?: string | null;
}

export function ActionChecklist({
  items,
  disabled,
  onItemsChange,
  memberOptions = [],
  focusRowId = null,
}: ActionChecklistProps) {
  const quickInputRef = useRef<HTMLTextAreaElement | null>(null);
  const itemInputRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const rowContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [focusItemIndex, setFocusItemIndex] = useState<number | null>(null);
  const [focusQuick, setFocusQuick] = useState(false);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  const [assigneeOpenRowId, setAssigneeOpenRowId] = useState<string | null>(null);
  const [dueOpenRowId, setDueOpenRowId] = useState<string | null>(null);

  const quickRow = items[0];
  const bodyRows = items.slice(1);
  const quickIdOk = quickRow?.id === ACTION_CHECKLIST_QUICK_ROW_ID;

  const sizeSignature = items.map((r) => r.text).join('\u0001');
  const membersById = useMemo(() => new Map(memberOptions.map((m) => [m.id, m])), [memberOptions]);

  useLayoutEffect(() => {
    syncTextareaHeight(quickInputRef.current);
    itemInputRefs.current.forEach((el) => syncTextareaHeight(el));
  }, [sizeSignature]);

  useEffect(() => {
    if (!focusQuick) return;
    const el = quickInputRef.current;
    el?.focus();
    if (el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    setFocusQuick(false);
  }, [focusQuick]);

  useEffect(() => {
    if (focusItemIndex === null) return;
    const el = itemInputRefs.current[focusItemIndex];
    el?.focus();
    if (el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    setFocusItemIndex(null);
  }, [focusItemIndex, bodyRows.length]);

  useEffect(() => {
    if (!focusRowId) return;
    const el = rowContainerRefs.current[focusRowId];
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      // ignore
    }
    setHighlightRowId(focusRowId);
    const t = setTimeout(() => setHighlightRowId((cur) => (cur === focusRowId ? null : cur)), 1600);
    return () => clearTimeout(t);
  }, [focusRowId, bodyRows.length]);

  const updateQuick = useCallback(
    (text: string) => {
      if (!quickIdOk) return;
      const next = [{ ...items[0], text }, ...items.slice(1)];
      onItemsChange(next);
    },
    [items, onItemsChange, quickIdOk]
  );

  const updateBodyRow = useCallback(
    (bodyIndex: number, patch: Partial<JournalLogEntry>) => {
      const i = bodyIndex + 1;
      const next = items.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
      onItemsChange(next);
    },
    [items, onItemsChange]
  );

  const commitQuickRowAndFocusTop = useCallback(() => {
    if (!quickIdOk) return;
    const text = items[0].text.trim();
    if (!text) {
      setFocusQuick(true);
      return;
    }
    const newEntry: JournalLogEntry = {
      id: newId(),
      text,
      createdAt: nowIso(),
      done: false,
    };
    const emptyQuick: JournalLogEntry = {
      id: ACTION_CHECKLIST_QUICK_ROW_ID,
      text: '',
      createdAt: nowIso(),
      done: false,
    };
    onItemsChange([emptyQuick, newEntry, ...items.slice(1)]);
    setFocusQuick(true);
  }, [items, onItemsChange, quickIdOk]);

  const insertAfterBody = useCallback(
    (bodyIndex: number) => {
      const row: JournalLogEntry = { id: newId(), text: '', createdAt: nowIso(), done: false };
      const insertAt = bodyIndex + 2;
      const next = [...items.slice(0, insertAt), row, ...items.slice(insertAt)];
      onItemsChange(next);
      setFocusItemIndex(bodyIndex + 1);
    },
    [items, onItemsChange]
  );

  const removeBodyRow = useCallback(
    (bodyIndex: number) => {
      const at = bodyIndex + 1;
      if (items.length <= 2) {
        onItemsChange([
          { id: ACTION_CHECKLIST_QUICK_ROW_ID, text: '', createdAt: nowIso(), done: false },
        ]);
        setFocusQuick(true);
        return;
      }
      const next = items.filter((_, i) => i !== at);
      onItemsChange(next);
      setFocusItemIndex(Math.max(0, bodyIndex - 1));
    },
    [items, onItemsChange]
  );

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (disabled) return;
      const { destination, source } = result;
      if (!destination || destination.index === source.index) return;
      const offset = 1;
      const src = source.index + offset;
      const dest = destination.index + offset;
      const next = [...items];
      const [removed] = next.splice(src, 1);
      next.splice(dest, 0, removed);
      onItemsChange(next);
    },
    [disabled, items, onItemsChange]
  );

  if (!quickIdOk) {
    return (
      <p className="text-xs text-muted-foreground">
        Checklist could not be loaded (missing expected quick-capture row).
      </p>
    );
  }

  const textareaClass = cn(
    // Checklist rows render in a flex layout; keep textarea taking remaining width.
    'min-w-0 flex-1 w-full resize-none border-0 bg-transparent py-1 text-[15px] leading-relaxed outline-none',
    'placeholder:text-muted-foreground/50',
    // Keep natural wrapping; long unbroken tokens may still wrap (expected).
    'break-words [overflow-wrap:anywhere] whitespace-pre-wrap'
  );

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            'group flex items-start gap-2 rounded-md border border-transparent px-1 py-1.5',
            'border-dashed border-border/50 bg-muted/20'
          )}
        >
          <div className="mt-1.5 w-4 shrink-0" aria-hidden />
          <div className="pt-0.5">
            <Checkbox checked={false} disabled className="border-muted-foreground/30 opacity-50" aria-hidden />
          </div>
          <textarea
            ref={quickInputRef}
            rows={1}
            value={quickRow.text}
            disabled={disabled}
            enterKeyHint="done"
            placeholder="Checklist item…"
            onChange={(e) => {
              updateQuick(e.target.value);
              requestAnimationFrame(() => syncTextareaHeight(quickInputRef.current));
            }}
            onKeyDown={(e) => {
              if (shouldCommitNewItem(e)) {
                e.preventDefault();
                commitQuickRowAndFocusTop();
                return;
              }
              if (e.key === 'Backspace' && quickRow.text === '') {
                e.preventDefault();
              }
            }}
            onKeyUp={(e) => {
              if (isEnterLike(e) && !e.shiftKey) e.preventDefault();
            }}
            className={textareaClass}
            aria-label="New checklist item"
          />
        </div>

        <Droppable droppableId="action-checklist-body" isDropDisabled={disabled}>
          {(dropProvided) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className="flex flex-col gap-0.5"
            >
              {bodyRows.map((row, bodyIndex) => (
                <Draggable key={row.id} draggableId={row.id} index={bodyIndex} isDragDisabled={disabled}>
                  {(dragProvided, snapshot) =>
                    portalDndRowToBody(
                      <div
                        ref={(el) => {
                          dragProvided.innerRef(el);
                          rowContainerRefs.current[row.id] = el;
                        }}
                        {...dragProvided.draggableProps}
                        className={cn(
                          'group flex items-start gap-2 rounded-md border border-transparent px-1 py-1.5 transition-colors',
                          'transition-[background-color,border-color,box-shadow] duration-300',
                          'hover:border-border/80 hover:bg-muted/30',
                          highlightRowId === row.id &&
                            [
                              // Superlist-ish deep link focus: soft background + focus ring + subtle pulse.
                              'border-primary/50 bg-primary/10 shadow-sm',
                              'ring-2 ring-primary/25 ring-offset-2 ring-offset-background',
                              'motion-safe:animate-pulse',
                            ].join(' '),
                          snapshot.isDragging &&
                            'z-[500] border-border bg-muted/50 shadow-md ring-1 ring-black/5 dark:ring-white/10'
                        )}
                      >
                      <button
                        type="button"
                        className={cn(
                          'mt-1.5 shrink-0 touch-none text-muted-foreground opacity-60 hover:opacity-100',
                          disabled && 'pointer-events-none opacity-30'
                        )}
                        aria-label="Drag"
                        {...dragProvided.dragHandleProps}
                        tabIndex={-1}
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <div
                        className="pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={row.done === true}
                          disabled={disabled || !row.text.trim()}
                          onCheckedChange={(v) => updateBodyRow(bodyIndex, { done: v === true })}
                          aria-label="Completed"
                          className="border-muted-foreground/40"
                        />
                      </div>
                      <div className="min-w-0 flex-1 flex items-start gap-2">
                        <textarea
                          ref={(el) => {
                            itemInputRefs.current[bodyIndex] = el;
                          }}
                          rows={1}
                          value={row.text}
                          disabled={disabled}
                          enterKeyHint="done"
                          placeholder="Checklist item…"
                          onChange={(e) => {
                            const t = e.target.value;
                            updateBodyRow(bodyIndex, {
                              text: t,
                              ...(row.text !== t ? { updatedAt: nowIso() } : {}),
                            });
                            requestAnimationFrame(() => syncTextareaHeight(itemInputRefs.current[bodyIndex]));
                          }}
                          onKeyDown={(e) => {
                            if (shouldCommitNewItem(e)) {
                              e.preventDefault();
                              insertAfterBody(bodyIndex);
                              return;
                            }
                            if (e.key === 'Backspace' && row.text === '') {
                              e.preventDefault();
                              removeBodyRow(bodyIndex);
                            }
                          }}
                          onKeyUp={(e) => {
                            if (isEnterLike(e) && !e.shiftKey) e.preventDefault();
                          }}
                          className={cn(
                            textareaClass,
                            row.done === true &&
                              'text-muted-foreground line-through decoration-muted-foreground/60'
                          )}
                          aria-label="Checklist item"
                        />
                        <div className="mt-0.5 shrink-0">
                          <TooltipProvider delayDuration={250}>
                            <div className="flex flex-col items-center gap-1 opacity-90 transition-opacity group-hover:opacity-100">
                            <Popover
                              open={assigneeOpenRowId === row.id}
                              onOpenChange={(v) => setAssigneeOpenRowId(v ? row.id : null)}
                            >
                              <Tooltip>
                                <PopoverTrigger asChild>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        'h-7 w-7 rounded-md',
                                        row.assigneeId && 'bg-muted/40 text-foreground'
                                      )}
                                      disabled={disabled}
                                      aria-label="Assign checklist item"
                                    >
                                      {(() => {
                                        const m = row.assigneeId ? membersById.get(row.assigneeId) : null;
                                        if (!m) return <UserRound className="h-4 w-4" aria-hidden />;
                                        return (
                                          <span
                                            className="grid h-5 w-5 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                                            aria-hidden
                                          >
                                            {initials(m.name)}
                                          </span>
                                        );
                                      })()}
                                    </Button>
                                  </TooltipTrigger>
                                </PopoverTrigger>
                                <TooltipContent>Assignee</TooltipContent>
                              </Tooltip>
                              <PopoverContent
                                align="end"
                                side="bottom"
                                className="w-72 p-0"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                              >
                                <Command>
                                  <CommandInput placeholder="Search member…" />
                                  <CommandList>
                                    <CommandEmpty>No results.</CommandEmpty>
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() => {
                                          updateBodyRow(bodyIndex, { assigneeId: null });
                                          setAssigneeOpenRowId(null);
                                        }}
                                      >
                                        <span className="text-sm">Unassigned</span>
                                      </CommandItem>
                                    </CommandGroup>
                                    <CommandGroup>
                                      {memberOptions.map((m) => (
                                        <CommandItem
                                          key={m.id}
                                          onSelect={() => {
                                            updateBodyRow(bodyIndex, { assigneeId: m.id });
                                            setAssigneeOpenRowId(null);
                                          }}
                                        >
                                          <span className="mr-2 grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/80">
                                            {initials(m.name)}
                                          </span>
                                          <span className="truncate">{m.name}</span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>

                            <Popover
                              open={dueOpenRowId === row.id}
                              onOpenChange={(v) => setDueOpenRowId(v ? row.id : null)}
                            >
                              <Tooltip>
                                <PopoverTrigger asChild>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        'h-7 w-7 rounded-md',
                                        row.dueDate && 'bg-muted/40 text-foreground'
                                      )}
                                      disabled={disabled}
                                      aria-label="Set due date"
                                    >
                                      <CalendarIcon className="h-4 w-4" aria-hidden />
                                    </Button>
                                  </TooltipTrigger>
                                </PopoverTrigger>
                                <TooltipContent>
                                  {row.dueDate ? `Due: ${row.dueDate}` : 'Due date'}
                                </TooltipContent>
                              </Tooltip>
                              <PopoverContent
                                align="end"
                                side="bottom"
                                className="w-auto p-2"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                              >
                                <div className="flex items-center justify-between gap-2 px-1 pb-2">
                                  <p className="text-xs font-medium text-muted-foreground">Due date</p>
                                  {row.dueDate && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => {
                                        updateBodyRow(bodyIndex, { dueDate: null });
                                        setDueOpenRowId(null);
                                      }}
                                    >
                                      <X className="mr-1 h-3.5 w-3.5" />
                                      Clear
                                    </Button>
                                  )}
                                </div>
                                <Calendar
                                  mode="single"
                                  selected={parseYmdLocal(row.dueDate)}
                                  onSelect={(d) => {
                                    if (!d) return;
                                    updateBodyRow(bodyIndex, { dueDate: toYmdLocal(d) });
                                    setDueOpenRowId(null);
                                  }}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            </div>
                          </TooltipProvider>
                        </div>
                      </div>
                      </div>,
                      snapshot.isDragging
                    )
                  }
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </DragDropContext>
  );
}
