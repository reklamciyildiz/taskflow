'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ACTION_CHECKLIST_QUICK_ROW_ID } from '@/lib/action-checklist';
import type { JournalLogEntry } from '@/lib/types';

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `jl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isEnterLike(e: React.KeyboardEvent<HTMLInputElement>): boolean {
  // Mobile keyboards can report Enter inconsistently (e.g. "Go"/"Done"/"Unidentified"), so fall back to keyCode.
  // Also ignore IME composition to avoid accidental commits mid-composition.
  const native = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number; which?: number };
  if (native?.isComposing) return false;
  const code = native?.keyCode ?? native?.which;
  // IMPORTANT: Some mobile browsers report many keys as "Unidentified" — do NOT treat that as Enter.
  if (e.key === 'Enter') return true;
  // Treat "Go/Done/Next/Search/Send" as Enter only when keyCode is 13.
  if (code === 13 && ['Done', 'Go', 'Next', 'Search', 'Send'].includes(e.key)) return true;
  return code === 13;
}

export interface ActionChecklistProps {
  items: JournalLogEntry[];
  disabled: boolean;
  onItemsChange: (next: JournalLogEntry[]) => void;
}

export function ActionChecklist({ items, disabled, onItemsChange }: ActionChecklistProps) {
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const itemInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusItemIndex, setFocusItemIndex] = useState<number | null>(null);
  /** focusItemIndex: 1 = first row below quick-add */
  const [focusQuick, setFocusQuick] = useState(false);

  const quickRow = items[0];
  const bodyRows = items.slice(1);
  const quickIdOk = quickRow?.id === ACTION_CHECKLIST_QUICK_ROW_ID;

  useEffect(() => {
    if (!focusQuick) return;
    quickInputRef.current?.focus();
    const el = quickInputRef.current;
    if (el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    setFocusQuick(false);
  }, [focusQuick]);

  useEffect(() => {
    if (focusItemIndex === null) return;
    const el = itemInputRefs.current[focusItemIndex];
    if (el) {
      el.focus();
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
        Liste yüklenemedi (beklenen hızlı ekleme satırı eksik).
      </p>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-0.5">
        {/* Sabit üst satır: hızlı ekleme — sürüklenemez */}
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
          <input
            ref={quickInputRef}
            type="text"
            value={quickRow.text}
            disabled={disabled}
            enterKeyHint="done"
            placeholder="Liste maddesi…"
            onChange={(e) => updateQuick(e.target.value)}
            onKeyDown={(e) => {
              if (isEnterLike(e)) {
                e.preventDefault();
                commitQuickRowAndFocusTop();
                return;
              }
              if (e.key === 'Backspace' && quickRow.text === '') {
                e.preventDefault();
              }
            }}
            onKeyUp={(e) => {
              // Some mobile browsers will move focus on keyup even if keydown is missed.
              if (isEnterLike(e)) e.preventDefault();
            }}
            className={cn(
              'min-w-0 flex-1 border-0 bg-transparent py-1 text-[15px] leading-relaxed outline-none',
              'placeholder:text-muted-foreground/50'
            )}
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
                        aria-label="Sürükle"
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
                          aria-label="Tamamlandı"
                          className="border-muted-foreground/40"
                        />
                      </div>
                      <input
                        ref={(el) => {
                          itemInputRefs.current[bodyIndex] = el;
                        }}
                        type="text"
                        value={row.text}
                        disabled={disabled}
                        enterKeyHint="done"
                        placeholder="Liste maddesi…"
                        onChange={(e) => {
                          const t = e.target.value;
                          updateBodyRow(bodyIndex, {
                            text: t,
                            ...(row.text !== t ? { updatedAt: nowIso() } : {}),
                          });
                        }}
                        onKeyDown={(e) => {
                          if (isEnterLike(e)) {
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
                          if (isEnterLike(e)) e.preventDefault();
                        }}
                        className={cn(
                          'min-w-0 flex-1 border-0 bg-transparent py-1 text-[15px] leading-relaxed outline-none',
                          'placeholder:text-muted-foreground/50',
                          row.done === true && 'text-muted-foreground line-through decoration-muted-foreground/60'
                        )}
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
