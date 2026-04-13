'use client';

import { useMemo, useState, useCallback, useLayoutEffect, useRef, KeyboardEvent } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import type { JournalLogEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Check, Loader2, Pencil, StickyNote, X } from 'lucide-react';

function formatLogTime(iso: string): string {
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return iso;
    return format(d, 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

function activityMs(iso: string | undefined): number {
  if (!iso) return 0;
  try {
    const d = parseISO(iso);
    return isValid(d) ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

/** Last activity: düzenleme varsa o zaman, yoksa oluşturulma. */
function displayIso(entry: JournalLogEntry): string {
  const u = entry.updatedAt;
  if (u && activityMs(u) > 0) return u;
  return entry.createdAt;
}

export interface TaskProcessJournalProps {
  logs: JournalLogEntry[];
  canEdit: boolean;
  disabled?: boolean;
  onAppend: (text: string) => Promise<boolean>;
  onUpdate: (entryId: string, text: string) => Promise<boolean>;
}

export function TaskProcessJournal({
  logs,
  canEdit,
  disabled,
  onAppend,
  onUpdate,
}: TaskProcessJournalProps) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [pendingEdit, setPendingEdit] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  const sorted = useMemo(
    () =>
      [...logs].sort((a, b) => activityMs(displayIso(b)) - activityMs(displayIso(a))),
    [logs]
  );

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || !canEdit || pending) return;
    setPending(true);
    const ok = await onAppend(text);
    setPending(false);
    if (ok) setDraft('');
  }, [draft, canEdit, pending, onAppend]);

  const onDraftKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  useLayoutEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight, 44), 240);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > 240 ? 'auto' : 'hidden';
  }, [draft]);

  const startEdit = useCallback(
    (entry: JournalLogEntry) => {
      if (!canEdit || disabled || pending || pendingEdit) return;
      setEditingId(entry.id);
      setEditingDraft(entry.text);
    },
    [canEdit, disabled, pending, pendingEdit]
  );

  const cancelEdit = useCallback(() => {
    if (pendingEdit) return;
    setEditingId(null);
    setEditingDraft('');
  }, [pendingEdit]);

  const saveEdit = useCallback(async () => {
    const id = editingId;
    const text = editingDraft.trim();
    if (!id || !canEdit || disabled || pendingEdit) return;
    if (!text) return;
    setPendingEdit(true);
    const ok = await onUpdate(id, text);
    setPendingEdit(false);
    if (ok) {
      setEditingId(null);
      setEditingDraft('');
    }
  }, [editingDraft, editingId, canEdit, disabled, pendingEdit, onUpdate]);

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void saveEdit();
    }
  };

  return (
    <div className="min-w-0 space-y-3 overflow-hidden rounded-lg border border-amber-200/60 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100/90">
        <StickyNote className="h-4 w-4 shrink-0 opacity-80" />
        <Label className="text-base font-semibold">Process journal</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Add technical notes here; the newest entry appears on top. Enter to send · Shift+Enter for a new line.
      </p>

      {canEdit && (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
          <Textarea
            ref={draftRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKeyDown}
            enterKeyHint="send"
            placeholder="e.g. Slippage set to 0.5…"
            disabled={disabled || pending}
            className="min-h-[44px] min-w-0 flex-1 resize-none break-words [overflow-wrap:anywhere] whitespace-pre-wrap bg-white dark:bg-gray-900"
            aria-label="New journal note"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void submit()}
            disabled={disabled || pending || !draft.trim()}
            className="w-full shrink-0 sm:w-auto sm:mt-0.5"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
          </Button>
        </div>
      )}

      <ScrollArea className="h-[min(220px,40vh)] pr-3">
        <ul className="space-y-3">
          {sorted.length === 0 ? (
            <li className="text-sm text-muted-foreground italic py-2">No notes yet.</li>
          ) : (
            sorted.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  'relative pl-4 border-l-2 border-amber-300/80 dark:border-amber-700/80',
                  'text-sm leading-snug'
                )}
              >
                <time
                  className="block text-[11px] font-medium text-amber-800/90 dark:text-amber-200/80 tabular-nums mb-1"
                  dateTime={displayIso(entry)}
                  title={
                    entry.updatedAt && activityMs(entry.updatedAt) > 0
                      ? `First entry: ${formatLogTime(entry.createdAt)}`
                      : undefined
                  }
                >
                  {formatLogTime(displayIso(entry))}
                  {entry.updatedAt && activityMs(entry.updatedAt) > 0 ? (
                    <span className="text-muted-foreground font-normal"> · updated</span>
                  ) : null}
                </time>
                {editingId === entry.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      onKeyDown={onEditKeyDown}
                      enterKeyHint="enter"
                      disabled={disabled || pendingEdit}
                      className="min-h-[80px] w-full min-w-0 max-w-full resize-y break-words bg-white dark:bg-gray-900"
                      aria-label="Edit journal note"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void saveEdit()}
                        disabled={disabled || pendingEdit || !editingDraft.trim()}
                        className="gap-1.5"
                        title="Save (Ctrl/⌘ + Enter)"
                      >
                        {pendingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                        disabled={disabled || pendingEdit}
                        className="gap-1.5"
                        title="Cancel (Esc)"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                      <p className="text-[11px] text-muted-foreground sm:ml-auto">
                        Save: Ctrl/⌘ + Enter · Cancel: Esc
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="group flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground">
                      {entry.text}
                    </p>
                    {canEdit && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={cn(
                          'h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
                          'focus-visible:opacity-100'
                        )}
                        onClick={() => startEdit(entry)}
                        disabled={disabled || pending || pendingEdit}
                        aria-label="Notu düzenle"
                        title="Düzenle"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
