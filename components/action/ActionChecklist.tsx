'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
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
}

export function ActionChecklist({ items, disabled, onItemsChange }: ActionChecklistProps) {
  const quickInputRef = useRef<HTMLTextAreaElement | null>(null);
  const itemInputRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [focusItemIndex, setFocusItemIndex] = useState<number | null>(null);
  const [focusQuick, setFocusQuick] = useState(false);

  const quickRow = items[0];
  const bodyRows = items.slice(1);
  const quickIdOk = quickRow?.id === ACTION_CHECKLIST_QUICK_ROW_ID;

  const sizeSignature = items.map((r) => r.text).join('\u0001');

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
    'min-w-0 flex-1 resize-none border-0 bg-transparent py-1 text-[15px] leading-relaxed outline-none',
    'placeholder:text-muted-foreground/50',
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
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={cn(
                        'group flex items-start gap-2 rounded-md border border-transparent px-1 py-1.5 transition-colors',
                        'hover:border-border/80 hover:bg-muted/30',
                        snapshot.isDragging && 'bg-muted/50 shadow-sm'
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
                    </div>
                  )}
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
