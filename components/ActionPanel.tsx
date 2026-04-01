'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Task, TaskStatus, TaskPriority, useTaskContext } from '@/components/TaskContext';
import { ACTION_CHECKLIST_QUICK_ROW_ID } from '@/lib/action-checklist';
import type { JournalLogEntry } from '@/lib/types';
import { ActionChecklist } from '@/components/action/ActionChecklist';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

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

/** İlk satır her zaman UI-only hızlı ekleme; sunucudan gelen eski kayıtları ayıklayıp başa boş satır koyar. */
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

/** Kontrol listesi yalnızca `journal_logs`; `learnings` ayrı “Kazanımlar” alanında tutulur. */
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
  const { updateTask, currentTeam, canEditTask, customers, boardColumns, tasks } = useTaskContext();
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
  const [dueDate, setDueDate] = useState('');
  const [journalLogs, setJournalLogs] = useState<JournalLogEntry[]>([]);
  const [learnings, setLearnings] = useState('');
  /** Başlık, statü, açıklama vb. — not odaklı akış için varsayılan kapalı */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const journalRef = useRef<JournalLogEntry[]>([]);
  const lastPersistedLearnings = useRef('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const learningsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !task) return;
    const src = tasks.find((t) => t.id === task.id) ?? task;
    setTitle(src.title);
    setDescription(src.description || '');
    setStatus(src.status);
    setPriority(src.priority);
    setAssigneeId(src.assigneeId || 'unassigned');
    setCustomerId(src.customerId || 'none');
    setDueDate(src.dueDate ? src.dueDate.toISOString().split('T')[0] : '');
    const jl = journalLogsFromTask(src.journalLogs);
    setJournalLogs(jl);
    journalRef.current = jl;
    const learningsVal = src.learnings ?? '';
    setLearnings(learningsVal);
    lastPersistedLearnings.current = learningsVal.trim();
    setDetailsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when opening / task id
  }, [open, task?.id]);

  useEffect(() => {
    journalRef.current = journalLogs;
  }, [journalLogs]);

  const flushJournalSave = useCallback(async () => {
    if (!task || !canEdit) return;
    const cleaned = journalRef.current
      .filter((x) => x.id !== ACTION_CHECKLIST_QUICK_ROW_ID)
      .map((x) => ({ ...x, text: x.text.trim() }))
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

  useEffect(() => {
    if (!open || !task?.id || !canEdit) return;
    if (learningsDebounceRef.current) clearTimeout(learningsDebounceRef.current);
    const taskId = task.id;
    learningsDebounceRef.current = setTimeout(() => {
      const normalized = learnings.trim();
      if (normalized === lastPersistedLearnings.current) return;
      void (async () => {
        const ok = await updateTask(taskId, { learnings: normalized || null });
        if (ok) lastPersistedLearnings.current = normalized;
      })();
    }, 1500);
    return () => {
      if (learningsDebounceRef.current) clearTimeout(learningsDebounceRef.current);
    };
  }, [learnings, open, task?.id, canEdit, updateTask]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current);
    };
  }, []);

  const onJournalChange = useCallback(
    (next: JournalLogEntry[]) => {
      setJournalLogs(ensureQuickRowFirst(next));
      scheduleJournalPersist();
    },
    [scheduleJournalPersist]
  );

  const scheduleMetaPersist = useCallback(
    (patch: Partial<Task>) => {
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
            /* max-height + min-h-0: içerik scroll’u için flex çocuğu küçülebilsin */
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
                {canEdit ? 'Aksiyon' : 'Salt okunur'}
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
                            Aksiyon ayrıntıları
                          </p>
                          <p className="truncate text-sm font-medium text-foreground">
                            {title.trim() || 'Başlıksız aksiyon'}
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
                            Başlık
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
                            placeholder="Başlıksız aksiyon"
                            className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
                          />
                        </div>

                        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Statü</Label>
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
                                <SelectContent className="z-[200]">
                                  {statusSelectOptions.map((col) => (
                                    <SelectItem key={col.id} value={col.id}>
                                      {col.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Öncelik</Label>
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
                                <SelectContent className="z-[200]">
                                  <SelectItem value="low">Düşük</SelectItem>
                                  <SelectItem value="medium">Orta</SelectItem>
                                  <SelectItem value="high">Yüksek</SelectItem>
                                  <SelectItem value="urgent">Acil</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Atanan</Label>
                              <Select
                                value={assigneeId}
                                onValueChange={(v) => {
                                  setAssigneeId(v);
                                  if (task && canEdit) {
                                    void updateTask(task.id, { assigneeId: v === 'unassigned' ? null : v });
                                  }
                                }}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-9 border-border/60 bg-background/80">
                                  <SelectValue placeholder="Atanmadı" />
                                </SelectTrigger>
                                <SelectContent className="z-[200]">
                                  <SelectItem value="unassigned">Atanmadı</SelectItem>
                                  {currentTeam?.members.map((member) => (
                                    <SelectItem key={member.id} value={member.id}>
                                      {member.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px] uppercase text-muted-foreground">Bitiş</Label>
                              <Input
                                type="date"
                                value={dueDate}
                                disabled={!canEdit}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDueDate(v);
                                  if (task && canEdit) {
                                    void updateTask(task.id, { dueDate: v ? new Date(v) : undefined });
                                  }
                                }}
                                className="h-9 border-border/60 bg-background/80"
                              />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px] uppercase text-muted-foreground">Müşteri</Label>
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
                                  <SelectValue placeholder="Yok" />
                                </SelectTrigger>
                                <SelectContent className="z-[200]">
                                  <SelectItem value="none">Yok</SelectItem>
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
                          <Label className="text-[11px] uppercase text-muted-foreground">Açıklama</Label>
                          <textarea
                            value={description}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDescription(v);
                              scheduleMetaPersist({ description: v });
                            }}
                            placeholder="Kısa bağlam…"
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
                    <h2 className="text-sm font-medium text-foreground">Kontrol listesi</h2>
                    <p className="text-[11px] text-muted-foreground">Enter ile yeni satır · sürükleyerek sırala</p>
                  </div>
                  <div
                    className="max-h-[min(42vh,380px)] min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-border/40 bg-card/40 px-2 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionChecklist items={journalLogs} disabled={!canEdit} onItemsChange={onJournalChange} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Label htmlFor="action-kazanimlar" className="text-[11px] uppercase text-muted-foreground">
                      Kazanımlar
                    </Label>
                    {canEdit && (
                      <p className="text-[11px] text-muted-foreground">Bilgi Merkezi’nde özet olarak görünür · ~1,5 sn sonra kaydedilir</p>
                    )}
                  </div>
                  <textarea
                    id="action-kazanimlar"
                    value={learnings}
                    disabled={!canEdit}
                    onChange={(e) => setLearnings(e.target.value)}
                    placeholder="Öğrendiklerin, çıkarımların, mülakat notların… (kontrol listesinden ayrı, serbest metin)"
                    rows={5}
                    className={cn(
                      'max-h-[min(40vh,280px)] min-h-[120px] w-full resize-y rounded-lg border border-border/50 bg-muted/10 px-3 py-3',
                      'text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/45',
                      'focus-visible:ring-2 focus-visible:ring-ring/30'
                    )}
                  />
                </div>
              </div>
            </div>
        </motion.div>
      </div>
    </>
  );
}
