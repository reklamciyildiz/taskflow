'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { CalendarIcon, Check, ChevronDown, UserRound, X, Lightbulb, Maximize2, Minimize2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Task, TaskStatus, TaskPriority, TaskUpdateFields, useTaskContext } from '@/components/TaskContext';
import { ACTION_CHECKLIST_QUICK_ROW_ID } from '@/lib/action-checklist';
import type { JournalLogEntry } from '@/lib/types';
import { ActionChecklist } from '@/components/action/ActionChecklist';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatDueDateYmdLocal, parseYmdDateInput } from '@/lib/due-date';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format } from 'date-fns';
import { DueFlowPicker } from '@/components/due/DueFlowPicker';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';

export interface ActionPanelProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  /** Fires after the close animation completes (e.g. clear cached task in host). */
  onExitComplete?: () => void;
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

/** First row is always a UI-only quick-capture row; filters persisted rows and inserts an empty first row. */
function ensureQuickRowFirst(logs: JournalLogEntry[]): JournalLogEntry[] {
  const rest = logs.filter((x) => x.id !== ACTION_CHECKLIST_QUICK_ROW_ID);
  const quick = logs.find((x) => x.id === ACTION_CHECKLIST_QUICK_ROW_ID);
  const first: JournalLogEntry = {
    id: ACTION_CHECKLIST_QUICK_ROW_ID,
    text: quick?.text ?? '',
    createdAt: quick?.createdAt ?? nowIso(),
    done: false,
  };
  return [first, ...rest];
}

/** The checklist is stored in `journal_logs`; `learnings` are stored separately as free-form notes. */
function journalLogsFromTask(logs: JournalLogEntry[] | undefined): JournalLogEntry[] {
  const persisted = (logs ?? []).filter((x) => x.id !== ACTION_CHECKLIST_QUICK_ROW_ID);
  const quick: JournalLogEntry = {
    id: ACTION_CHECKLIST_QUICK_ROW_ID,
    text: '',
    createdAt: nowIso(),
    done: false,
  };
  return [quick, ...persisted];
}

export function ActionPanel({ task, open, onClose, onExitComplete }: ActionPanelProps) {
  const {
    updateTask,
    currentTeam,
    canEditTask,
    customers,
    boardColumns,
    tasks,
    customerSingularLabel,
    consumeChecklistFocusForTask,
  } = useTaskContext();
  const canEdit = task ? canEditTask(task.createdBy, task.assigneeId) : false;

  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('unassigned');
  const [customerId, setCustomerId] = useState<string>('none');
  const [dueDate, setDueDate] = useState(''); // YYYY-MM-DD
  const [taskReminders, setTaskReminders] = useState<string[]>([]);
  const [taskDueOpen, setTaskDueOpen] = useState(false);
  const [journalLogs, setJournalLogs] = useState<JournalLogEntry[]>([]);
  const [deepLinkChecklistRowId, setDeepLinkChecklistRowId] = useState<string | null>(null);
  const [learnings, setLearnings] = useState('');
  const [learningsOpen, setLearningsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState<'none' | 'checklist' | 'learnings'>('none');
  const [zenOpen, setZenOpen] = useState(false);
  const [zenTab, setZenTab] = useState<'checklist' | 'learnings'>('checklist');
  /** Title, status, description, etc. — default collapsed for a note-first flow */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const journalRef = useRef<JournalLogEntry[]>([]);
  const lastPersistedLearnings = useRef('');
  const learningsRef = useRef(learnings);
  learningsRef.current = learnings;
  /** Track which action the `learnings` state belongs to (persist previous on action change). */
  const learningsHydratedTaskIdRef = useRef<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const learningsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistLearningsForId = useCallback(
    async (taskId: string, rawText: string) => {
      if (!canEdit || !taskId) return;
      const normalized = rawText.trim();
      const ok = await updateTask(taskId, { learnings: normalized || null });
      if (ok && task?.id === taskId) {
        lastPersistedLearnings.current = normalized;
      }
    },
    [canEdit, updateTask, task?.id]
  );

  /** `updateTask` gets a new ref when `tasks` changes; putting it in deps would retrigger hydration and wipe draft checklist edits. */
  const persistLearningsForIdRef = useRef(persistLearningsForId);
  persistLearningsForIdRef.current = persistLearningsForId;

  useEffect(() => {
    if (!open || !task) return;
    const prevHydrated = learningsHydratedTaskIdRef.current;
    if (prevHydrated && prevHydrated !== task.id && canEdit) {
      if (learningsDebounceRef.current) {
        clearTimeout(learningsDebounceRef.current);
        learningsDebounceRef.current = null;
      }
      void persistLearningsForIdRef.current(prevHydrated, learningsRef.current);
    }
    learningsHydratedTaskIdRef.current = task.id;

    const src = tasks.find((t) => t.id === task.id) ?? task;
    setTitle(src.title);
    setDescription(src.description || '');
    setStatus(src.status);
    setPriority(src.priority);
    setAssigneeId(src.assigneeId || 'unassigned');
    setCustomerId(src.customerId || 'none');
    setDueDate(src.dueDate ? formatDueDateYmdLocal(src.dueDate) : '');
    setTaskReminders(Array.isArray(src.reminders) ? src.reminders : []);
    const jl = journalLogsFromTask(src.journalLogs);
    setJournalLogs(jl);
    journalRef.current = jl;
    setDeepLinkChecklistRowId(consumeChecklistFocusForTask(src.id));
    const learningsVal = src.learnings ?? '';
    setLearnings(learningsVal);
    lastPersistedLearnings.current = learningsVal.trim();
    setDetailsOpen(false);
    setLearningsOpen(false);
    setFocusMode('none');
    setZenOpen(false);
    setZenTab('checklist');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only panel/action identity; do NOT re-hydrate on tasks/updateTask/persistLearnings changes
  }, [open, task?.id]);

  useEffect(() => {
    journalRef.current = journalLogs;
  }, [journalLogs]);

  const flushJournalSave = useCallback(async () => {
    if (!task || !canEdit) return;
    const cleaned = journalRef.current
      .filter((x) => x.id !== ACTION_CHECKLIST_QUICK_ROW_ID)
      .map((x) => ({
        ...x,
        text: x.text.trim(),
        assigneeId: x.assigneeId ?? null,
        dueDate: x.dueDate ?? null,
        reminders: x.reminders ?? null,
      }))
      .filter((x) => x.text.length > 0);
    await updateTask(task.id, { journalLogs: cleaned });
  }, [task, canEdit, updateTask]);

  const scheduleJournalPersist = useCallback(() => {
    if (!task || !canEdit) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void flushJournalSave();
    }, 550);
  }, [task, canEdit, flushJournalSave]);

  const LEARNINGS_SAVE_MS = 280;

  useEffect(() => {
    if (!open || !task?.id || !canEdit) return;
    if (learningsDebounceRef.current) clearTimeout(learningsDebounceRef.current);
    const taskId = task.id;
    learningsDebounceRef.current = setTimeout(() => {
      learningsDebounceRef.current = null;
      const normalized = learningsRef.current.trim();
      if (normalized === lastPersistedLearnings.current) return;
      void persistLearningsForIdRef.current(taskId, learningsRef.current);
    }, LEARNINGS_SAVE_MS);
    return () => {
      if (learningsDebounceRef.current) clearTimeout(learningsDebounceRef.current);
    };
  }, [learnings, open, task?.id, canEdit]);

  /** When the panel closes (X, overlay, another action), persist any pending text immediately. */
  useEffect(() => {
    if (open) return;
    if (learningsDebounceRef.current) {
      clearTimeout(learningsDebounceRef.current);
      learningsDebounceRef.current = null;
    }
    const tid = task?.id;
    if (!tid || !canEdit) return;
    const normalized = learningsRef.current.trim();
    if (normalized === lastPersistedLearnings.current) return;
    void persistLearningsForId(tid, learningsRef.current);
  }, [open, task?.id, canEdit, persistLearningsForId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current);
      if (learningsDebounceRef.current) clearTimeout(learningsDebounceRef.current);
    };
  }, []);

  const onJournalChange = useCallback(
    (next: JournalLogEntry[] | ((prev: JournalLogEntry[]) => JournalLogEntry[])) => {
      setJournalLogs((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        return ensureQuickRowFirst(resolved);
      });
      scheduleJournalPersist();
    },
    [scheduleJournalPersist]
  );

  const scheduleMetaPersist = useCallback(
    (patch: TaskUpdateFields) => {
      if (!task || !canEdit) return;
      if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current);
      metaDebounceRef.current = setTimeout(() => {
        metaDebounceRef.current = null;
        void updateTask(task.id, patch);
      }, 450);
    },
    [task, canEdit, updateTask]
  );

  const statusSelectOptions = useMemo(() => {
    const base = boardColumns;
    if (status && !base.some((c) => c.id === status)) {
      return [{ id: status, title: status }, ...base];
    }
    return base;
  }, [boardColumns, status]);

  const sheetVariants: Variants = useMemo(
    () => ({
      closed: isNarrow
        ? { opacity: 0, y: '100%', scale: 1 }
        : { opacity: 0, scale: 0.94, y: 12 },
      open: { opacity: 1, scale: 1, y: 0 },
    }),
    [isNarrow]
  );

  const selectedDueDate = dueDate ? parseYmdDateInput(dueDate) : undefined;

  const dueAtDraft = useMemo(() => (dueDate ? parseYmdDateInput(dueDate) ?? null : null), [dueDate]);
  const learningsPreview = useMemo(() => {
    const t = learningsRef.current.trim();
    if (!t) return '';
    return t.replace(/\s+/g, ' ').slice(0, 140);
  }, [learnings]);

  const flushLearningsNow = useCallback(() => {
    if (!task?.id || !canEdit) return;
    if (learningsDebounceRef.current) {
      clearTimeout(learningsDebounceRef.current);
      learningsDebounceRef.current = null;
    }
    const normalized = learningsRef.current.trim();
    if (normalized === lastPersistedLearnings.current) return;
    void persistLearningsForIdRef.current(task.id, learningsRef.current);
  }, [task?.id, canEdit]);

  const learningChips = useMemo(
    () => [
      { label: 'Key takeaways', template: '## Key takeaways\n- \n' },
      { label: 'What worked', template: '## What worked\n- \n' },
      { label: 'What didn’t', template: '## What didn’t\n- \n' },
      { label: 'Next time', template: '## Next time\n- \n' },
      { label: 'Decision', template: '## Decision / rationale\n- \n' },
    ],
    []
  );

  const appendLearningTemplate = useCallback(
    (template: string) => {
      if (!canEdit) return;
      setLearningsOpen(true);
      setLearnings((prev) => {
        const next = prev?.trim().length ? `${prev.trim()}\n\n${template}` : template;
        return next;
      });
    },
    [canEdit]
  );

  const setFocusModeSafe = useCallback(
    (next: 'none' | 'checklist' | 'learnings') => {
      setFocusMode((prev) => {
        if (prev === next) return 'none';
        // When leaving Learnings focus, flush immediately to avoid draft loss.
        if (prev === 'learnings' && next !== 'learnings') {
          flushLearningsNow();
        }
        return next;
      });

      if (next === 'checklist') {
        if (learningsOpen) {
          setLearningsOpen(false);
          flushLearningsNow();
        }
      } else if (next === 'learnings') {
        setLearningsOpen(true);
      }
    },
    [flushLearningsNow, learningsOpen]
  );

  const openZen = useCallback(
    (tab: 'checklist' | 'learnings') => {
      // Zen is intentionally isolated from the panel layout modes.
      setFocusMode('none');
      setZenTab(tab);
      if (tab === 'learnings') setLearningsOpen(true);
      setZenOpen(true);
    },
    []
  );

  const closeZen = useCallback(() => {
    flushLearningsNow();
    setZenOpen(false);
  }, [flushLearningsNow]);

  const switchZenTab = useCallback(
    (tab: 'checklist' | 'learnings') => {
      // Leaving learnings → flush immediately.
      if (zenTab === 'learnings' && tab !== 'learnings') flushLearningsNow();
      setZenTab(tab);
      if (tab === 'learnings') setLearningsOpen(true);
    },
    [zenTab, flushLearningsNow]
  );

  if (!task) return null;

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm"
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.22 }}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
        onClick={onClose}
      />

      <div
        className={cn(
          'fixed inset-0 z-[51] flex pointer-events-none',
          'items-end justify-center md:items-center md:justify-center md:p-4 md:pb-8'
        )}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-panel-title"
          className={cn(
            'pointer-events-auto flex w-full max-w-3xl flex-col overflow-hidden border border-border/60 bg-background shadow-2xl',
            'ring-1 ring-black/5 dark:ring-white/10',
            /* max-height + min-h-0: allow the flex child to shrink for scrollable content */
            'max-h-[min(92dvh,920px)] min-h-0',
            'rounded-t-2xl border-b-0 md:rounded-2xl md:border md:max-h-[min(88dvh,900px)]',
            'origin-bottom md:origin-center'
          )}
          variants={sheetVariants}
          initial="closed"
          animate={open ? 'open' : 'closed'}
          transition={
            isNarrow
              ? { type: 'spring', damping: 32, stiffness: 380 }
              : { type: 'spring', damping: 28, stiffness: 320 }
          }
          onAnimationComplete={() => {
            if (!open) onExitComplete?.();
          }}
        >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-muted/10 px-4 py-3 md:rounded-t-2xl">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {canEdit ? 'Action' : 'Read-only'}
              </p>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              <div className="space-y-6 px-4 py-5 pb-8 md:px-6">
                <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                  <div className="space-y-3">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        aria-expanded={detailsOpen}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5 text-left transition-colors',
                          'hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'
                        )}
                      >
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                            detailsOpen && 'rotate-180'
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Action details
                          </p>
                          <p className="truncate text-sm font-medium text-foreground">
                            {title.trim() || 'Untitled action'}
                          </p>
                        </div>
                        <span className="hidden max-w-[40%] shrink-0 truncate rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground sm:inline-block">
                          {statusSelectOptions.find((c) => c.id === status)?.title ?? status}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="overflow-hidden">
                      <div className="space-y-6 pt-1">
                        <div className="space-y-2">
                          <label htmlFor="action-panel-title" className="sr-only">
                            Title
                          </label>
                          <Input
                            id="action-panel-title"
                            value={title}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTitle(v);
                              scheduleMetaPersist({ title: v });
                            }}
                            placeholder="Untitled action"
                            className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
                          />
                        </div>

                        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Status</Label>
                              <Select
                                value={status}
                                onValueChange={(v) => {
                                  setStatus(v as TaskStatus);
                                  if (task && canEdit) void updateTask(task.id, { status: v as TaskStatus });
                                }}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-9 border-border/60 bg-background/80">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusSelectOptions.map((col) => (
                                    <SelectItem key={col.id} value={col.id}>
                                      {col.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Priority</Label>
                              <Select
                                value={priority}
                                onValueChange={(v) => {
                                  setPriority(v as TaskPriority);
                                  if (task && canEdit) void updateTask(task.id, { priority: v as TaskPriority });
                                }}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-9 border-border/60 bg-background/80">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="low">Low</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="urgent">Urgent</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Assignee</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!canEdit}
                                    className={cn(
                                      'h-9 w-full justify-between border-border/60 bg-background/80 text-left font-normal',
                                      assigneeId === 'unassigned' && 'text-muted-foreground'
                                    )}
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      {assigneeId === 'unassigned' ? (
                                        <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/70">
                                          <UserRound className="h-3.5 w-3.5" aria-hidden />
                                        </span>
                                      ) : (
                                        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                                          {initials(
                                            currentTeam?.members.find((m) => m.id === assigneeId)?.name ?? ''
                                          )}
                                        </span>
                                      )}
                                      <span className="truncate">
                                        {assigneeId === 'unassigned'
                                          ? 'Unassigned'
                                          : currentTeam?.members.find((m) => m.id === assigneeId)?.name ?? 'Assignee'}
                                      </span>
                                    </span>
                                    <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-72 p-0"
                                  align="start"
                                  onOpenAutoFocus={(e) => e.preventDefault()}
                                >
                                  <div className="border-b border-border/60 px-3 py-2">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Assignee
                                    </p>
                                  </div>
                                  <Command className="rounded-none">
                                    <CommandInput placeholder="Search member…" />
                                    <CommandList>
                                      <CommandEmpty>No results.</CommandEmpty>
                                      <CommandGroup heading=" ">
                                        <CommandItem
                                          className="flex items-center gap-2"
                                          onSelect={() => {
                                            setAssigneeId('unassigned');
                                            if (task && canEdit) void updateTask(task.id, { assigneeId: null });
                                          }}
                                        >
                                          <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/70">
                                            <UserRound className="h-3.5 w-3.5" aria-hidden />
                                          </span>
                                          <span className="flex-1 truncate text-sm">Unassigned</span>
                                          {assigneeId === 'unassigned' && (
                                            <Check className="h-4 w-4 text-primary" aria-hidden />
                                          )}
                                        </CommandItem>
                                      </CommandGroup>
                                      <CommandGroup heading=" ">
                                        {(currentTeam?.members ?? []).map((member) => (
                                          <CommandItem
                                            key={member.id}
                                            className="flex items-center gap-2"
                                            onSelect={() => {
                                              setAssigneeId(member.id);
                                              if (task && canEdit) {
                                                void updateTask(task.id, { assigneeId: member.id });
                                              }
                                            }}
                                          >
                                            <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/80">
                                              {initials(member.name)}
                                            </span>
                                            <span className="flex-1 truncate">{member.name}</span>
                                            {assigneeId === member.id && (
                                              <Check className="h-4 w-4 text-primary" aria-hidden />
                                            )}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Due date</Label>
                              {isNarrow ? (
                                <Drawer open={taskDueOpen} onOpenChange={setTaskDueOpen}>
                                  <DrawerTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={!canEdit}
                                      className={cn(
                                        'h-9 w-full justify-start border-border/60 bg-background/80 text-left font-normal',
                                        !selectedDueDate && 'text-muted-foreground'
                                      )}
                                      onClick={() => setTaskDueOpen(true)}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
                                      {selectedDueDate ? format(selectedDueDate, 'PPP') : 'Select date'}
                                    </Button>
                                  </DrawerTrigger>
                                  <DrawerContent className="p-0">
                                    <div className="px-2 pb-3 pt-2">
                                      <DueFlowPicker
                                        value={task?.dueDate ?? null}
                                        reminders={taskReminders}
                                        disabled={!canEdit}
                                        onChange={(next) => {
                                          if (!task || !canEdit) return;
                                          setDueDate(next ? formatDueDateYmdLocal(next) : '');
                                          void updateTask(task.id, { dueDate: next, reminders: taskReminders });
                                        }}
                                        onRemindersChange={(next) => {
                                          if (!task || !canEdit) return;
                                          const arr = Array.isArray(next) ? next : [];
                                          setTaskReminders(arr);
                                          void updateTask(task.id, { reminders: arr });
                                        }}
                                        onRequestClose={() => setTaskDueOpen(false)}
                                      />
                                    </div>
                                  </DrawerContent>
                                </Drawer>
                              ) : (
                                <Dialog open={taskDueOpen} onOpenChange={setTaskDueOpen}>
                                  <DialogTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={!canEdit}
                                      className={cn(
                                        'h-9 w-full justify-start border-border/60 bg-background/80 text-left font-normal',
                                        !selectedDueDate && 'text-muted-foreground'
                                      )}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
                                      {selectedDueDate ? format(selectedDueDate, 'PPP') : 'Select date'}
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent
                                    hideClose
                                    className="flex max-h-[92dvh] min-h-0 w-[min(92vw,380px)] max-w-[min(92vw,380px)] flex-col gap-0 overflow-hidden p-0"
                                  >
                                    <DueFlowPicker
                                      value={task?.dueDate ?? null}
                                      reminders={taskReminders}
                                      disabled={!canEdit}
                                      onChange={(next) => {
                                        if (!task || !canEdit) return;
                                        setDueDate(next ? formatDueDateYmdLocal(next) : '');
                                        void updateTask(task.id, { dueDate: next, reminders: taskReminders });
                                      }}
                                      onRemindersChange={(next) => {
                                        if (!task || !canEdit) return;
                                        const arr = Array.isArray(next) ? next : [];
                                        setTaskReminders(arr);
                                        void updateTask(task.id, { reminders: arr });
                                      }}
                                      onRequestClose={() => setTaskDueOpen(false)}
                                    />
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px] uppercase text-muted-foreground">{customerSingularLabel}</Label>
                              <Select
                                value={customerId}
                                onValueChange={(v) => {
                                  setCustomerId(v);
                                  if (task && canEdit) {
                                    void updateTask(task.id, { customerId: v === 'none' ? null : v });
                                  }
                                }}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-9 border-border/60 bg-background/80">
                                  <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No {customerSingularLabel}</SelectItem>
                                  {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={customer.id}>
                                      {customer.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[11px] uppercase text-muted-foreground">Description</Label>
                          <textarea
                            value={description}
                            disabled={!canEdit}
                            enterKeyHint="enter"
                            onChange={(e) => {
                              const v = e.target.value;
                              setDescription(v);
                              scheduleMetaPersist({ description: v });
                            }}
                            placeholder="Short context…"
                            rows={2}
                            className="w-full resize-none rounded-lg border border-border/50 bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/45 focus-visible:ring-2 focus-visible:ring-ring/30"
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-medium text-foreground">Checklist</h2>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Open checklist in Zen mode"
                        onClick={() => openZen('checklist')}
                      >
                        <NotebookPen className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={focusMode === 'checklist' ? 'Exit checklist focus' : 'Focus checklist'}
                        onClick={() => setFocusModeSafe('checklist')}
                      >
                        {focusMode === 'checklist' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Enter = new item · Shift+Enter = line break · drag to reorder
                    </p>
                  </div>
                  <div
                    className={cn(
                      'min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-border/40 bg-card/40 px-2 py-3',
                      focusMode === 'checklist'
                        ? 'max-h-[min(74vh,680px)]'
                        : focusMode === 'learnings'
                          ? 'max-h-[min(28vh,260px)]'
                          : learningsOpen
                            ? 'max-h-[min(42vh,380px)]'
                            : 'max-h-[min(60vh,520px)]'
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionChecklist
                      items={journalLogs}
                      disabled={!canEdit}
                      onItemsChange={onJournalChange}
                      memberOptions={(currentTeam?.members ?? []).map((m) => ({ id: m.id, name: m.name }))}
                      focusRowId={deepLinkChecklistRowId}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border/40 bg-muted/10">
                  <div className="flex items-start gap-2 rounded-xl px-3 py-2.5">
                    <button
                      type="button"
                      className={cn(
                        'flex min-w-0 flex-1 items-start justify-between gap-3 text-left',
                        'hover:bg-muted/0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'
                      )}
                      onClick={() => {
                        const next = !learningsOpen;
                        setLearningsOpen(next);
                        if (!next) flushLearningsNow();
                        if (focusMode === 'learnings' && !next) setFocusMode('none');
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden />
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Learnings</p>
                        </div>
                        {learningsOpen ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Reflection notes. Autosaves while typing; also saves when you collapse or close.
                          </p>
                        ) : learningsPreview ? (
                          <p className="mt-1 truncate text-sm text-foreground/90">{learningsPreview}</p>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">Add a reflection (optional)</p>
                        )}
                      </div>
                      <ChevronDown
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                          learningsOpen && 'rotate-180'
                        )}
                        aria-hidden
                      />
                    </button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 h-7 w-7 shrink-0"
                      aria-label={focusMode === 'learnings' ? 'Exit learnings focus' : 'Focus learnings'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusModeSafe('learnings');
                      }}
                    >
                      {focusMode === 'learnings' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 h-7 w-7 shrink-0"
                      aria-label="Open learnings in Zen mode"
                      onClick={(e) => {
                        e.stopPropagation();
                        openZen('learnings');
                      }}
                    >
                      <NotebookPen className="h-4 w-4" />
                    </Button>
                  </div>

                  {learningsOpen ? (
                    <div className="space-y-2 border-t border-border/40 px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {learningChips.map((c) => (
                          <Button
                            key={c.label}
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={!canEdit}
                            className="h-7 rounded-full px-3 text-xs"
                            onClick={() => appendLearningTemplate(c.template)}
                          >
                            {c.label}
                          </Button>
                        ))}
                      </div>
                      <textarea
                        id="action-kazanimlar"
                        value={learnings}
                        disabled={!canEdit}
                        enterKeyHint="enter"
                        onChange={(e) => setLearnings(e.target.value)}
                        onBlur={flushLearningsNow}
                        placeholder="Write what you learned… (separate from the checklist)"
                        rows={5}
                        className={cn(
                          'w-full resize-y rounded-lg border border-border/50 bg-background/40 px-3 py-3',
                          'text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/45',
                          focusMode === 'learnings' ? 'max-h-[min(60vh,520px)] min-h-[180px]' : 'max-h-[min(40vh,280px)] min-h-[120px]',
                          'focus-visible:ring-2 focus-visible:ring-ring/30'
                        )}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
        </motion.div>
      </div>

      <Dialog
        open={zenOpen}
        onOpenChange={(next) => {
          if (!next) closeZen();
          else setZenOpen(true);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl p-0 sm:w-[min(96vw,1100px)] [&>button.absolute]:hidden">
          <div className="flex h-[min(92dvh,920px)] flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{title.trim() || 'Untitled action'}</p>
                <p className="text-xs text-muted-foreground">Zen mode</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={zenTab === 'checklist' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                  onClick={() => switchZenTab('checklist')}
                >
                  Checklist
                </Button>
                <Button
                  type="button"
                  variant={zenTab === 'learnings' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                  onClick={() => switchZenTab('learnings')}
                >
                  Learnings
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={closeZen}>
                  Close
                </Button>
              </div>
            </div>

            {zenTab === 'checklist' ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="rounded-xl border border-border/40 bg-card/40 px-2 py-3">
                  <ActionChecklist
                    items={journalLogs}
                    disabled={!canEdit}
                    onItemsChange={onJournalChange}
                    memberOptions={(currentTeam?.members ?? []).map((m) => ({ id: m.id, name: m.name }))}
                    focusRowId={deepLinkChecklistRowId}
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex flex-1 flex-col px-4 py-4">
                <div className="flex flex-wrap gap-2 pb-3">
                  {learningChips.map((c) => (
                    <Button
                      key={c.label}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canEdit}
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => appendLearningTemplate(c.template)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
                <textarea
                  value={learnings}
                  disabled={!canEdit}
                  enterKeyHint="enter"
                  onChange={(e) => setLearnings(e.target.value)}
                  onBlur={flushLearningsNow}
                  placeholder="Write what you learned… (separate from the checklist)"
                  className={cn(
                    'min-h-0 flex-1 overflow-y-auto resize-none rounded-xl border border-border/50 bg-background/40 px-4 py-4',
                    'text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/45',
                    'focus-visible:ring-2 focus-visible:ring-ring/30'
                  )}
                />
                <div className="pt-2 text-xs text-muted-foreground">
                  Autosaves while typing. Also saves when you switch tabs or close Zen.
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
