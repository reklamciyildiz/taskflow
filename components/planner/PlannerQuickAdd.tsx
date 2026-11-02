'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarPlus, CheckSquare2, Clock3, FolderKanban, Loader2, Plus, RotateCw, Sparkles, Layers3 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDueDateYmdLocal, parseYmdDateInput } from '@/lib/due-date';
import { isTerminalBoardColumn, FALLBACK_BOARD_COLUMNS } from '@/lib/types';
import { appendChecklistItemToTipTap, extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import type { WorkSource } from '@/lib/scheduling-domain';
import { usePlannerRuntime } from './PlannerRuntime';
import {
  dispatchScheduleChanged,
  PLANNER_CAPTURE_TIME_EVENT,
  type PlannerCaptureTimeDetail,
} from '@/lib/schedule-events';
import { parsePlannerCapture } from '@/lib/planner-v2-utils';

type CaptureKind = 'checklist' | 'action';
type ChecklistMode = 'new' | 'existing';
type PendingSchedule = {
  source: WorkSource;
  title: string;
  scheduleDate: string;
  scheduleTime: string | null;
  durationMinutes: number | null;
};

/** A small everyday step belongs to a canonical Action checklist, not a fake new project. */
export function PlannerQuickAdd() {
  const { addTask, updateTask, tasks, projects, canEditTask, currentTeam, currentUser,
    generalBoardColumns, scheduleApi } = usePlannerRuntime();
  const today = formatDueDateYmdLocal(new Date());
  const [kind, setKind] = useState<CaptureKind>('checklist');
  const [checklistMode, setChecklistMode] = useState<ChecklistMode>('new');
  const [parentId, setParentId] = useState('');
  const [existingId, setExistingId] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parsePlannerCapture(value, today), [today, value]);
  // Checklists are daily by default; actions retain their former Anytime behavior.
  const effectiveDate = date ?? parsed.date ?? (kind === 'checklist' ? today : null);
  const effectiveTime = time || parsed.time || '';

  const parents = useMemo(() => tasks.filter((task) => {
    if (!currentTeam || task.teamId !== currentTeam.id) return false;
    const columns = task.projectId
      ? projects.find((project) => project.id === task.projectId)?.columnConfig ?? []
      : generalBoardColumns.length ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    return !isTerminalBoardColumn(task.status, columns)
      && canEditTask(task.createdBy, task.assigneeId);
  }).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()), [
    tasks, projects, generalBoardColumns, currentTeam, canEditTask,
  ]);
  const selectedParent = parents.find((task) => task.id === parentId) ?? null;
  const availableItems = useMemo(() => selectedParent
    ? extractChecklistItemsFromTipTap(selectedParent.checklistBlocks)
      .filter((item) => Boolean(item.id) && !item.checked)
    : [], [selectedParent]);
  const selectedItem = availableItems.find((item) => item.id === existingId) ?? null;
  const validInput = kind === 'action' ? Boolean(parsed.title.trim())
    : Boolean(selectedParent && (checklistMode === 'new' ? parsed.title.trim() : selectedItem));
  const locked = busy || pendingSchedule !== null;

  useEffect(() => {
    if (!currentTeam) { setParentId(''); return; }
    try {
      const stored = localStorage.getItem('actiproc:planner-checklist-parent:' + currentTeam.id);
      setParentId(stored ?? '');
    } catch { setParentId(''); }
  }, [currentTeam?.id]);

  function chooseParent(id: string) {
    setParentId(id);
    setValue('');
    setExistingId('');
    if (!currentTeam) return;
    try {
      localStorage.setItem('actiproc:planner-checklist-parent:' + currentTeam.id, id);
    } catch { /* A device without storage still works for this session. */ }
  }

  useEffect(() => {
    const selectCalendarTime = (event: Event) => {
      const detail = (event as CustomEvent<PlannerCaptureTimeDetail>).detail;
      if (!detail?.date || !detail.time || pendingSchedule) return;
      setDate(detail.date);
      setTime(detail.time);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => titleRef.current?.focus(), 250);
      toast.info(`Selected ${detail.date} at ${detail.time}`);
    };
    window.addEventListener(PLANNER_CAPTURE_TIME_EVENT, selectCalendarTime);
    return () => window.removeEventListener(PLANNER_CAPTURE_TIME_EVENT, selectCalendarTime);
  }, [pendingSchedule]);

  async function saveTimeBlock(input: PendingSchedule) {
    const response = await scheduleApi.save({
      source: input.source,
      scheduleType: 'one_off',
      scheduleDate: input.scheduleDate,
      scheduleTime: input.scheduleTime,
      timeZone: input.scheduleTime ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : null,
      durationMinutes: input.scheduleTime ? input.durationMinutes : null,
      reminderRules: [],
    });
    if (!response.success || !response.data) throw new Error(response.error || 'Time block could not be saved.');
    dispatchScheduleChanged(input.source, response.data);
  }

  async function retrySchedule() {
    if (!pendingSchedule || busy) return;
    setBusy(true);
    try {
      await saveTimeBlock(pendingSchedule);
      setPendingSchedule(null);
      toast.success('Time block saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Time block could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function resetInput() {
    setValue(''); setDate(null); setTime(''); setDuration(30); setExistingId('');
  }

  async function submit() {
    if (!currentTeam || busy || pendingSchedule || !validInput) return;
    if (effectiveDate && effectiveDate < today) {
      toast.error('Choose today or a future date.');
      return;
    }
    if (effectiveTime && !effectiveDate) {
      toast.error('Choose a date before setting a time.');
      return;
    }
    setBusy(true);
    try {
      let source: WorkSource;
      let title: string;
      if (kind === 'action') {
        const initial = generalBoardColumns.find((column) => !isTerminalBoardColumn(column.id, generalBoardColumns))
          ?? generalBoardColumns[0];
        const task = await addTask({
          title: parsed.title.trim(), description: '', priority: 'medium', teamId: currentTeam.id,
          projectId: null, status: initial?.id ?? 'todo', createdBy: currentUser?.id ?? '',
          assigneeId: null, customerId: null,
          dueDate: effectiveDate ? parseYmdDateInput(effectiveDate) : undefined,
        });
        source = { sourceType: 'action', taskId: task.id };
        title = task.title;
        if (effectiveDate && !effectiveTime && task.schedule)
          dispatchScheduleChanged(source, task.schedule);
      } else {
        if (!selectedParent || !canEditTask(selectedParent.createdBy, selectedParent.assigneeId))
          throw new Error('Select an editable Action first.');
        title = checklistMode === 'new' ? parsed.title.trim() : selectedItem?.text ?? '';
        if (!title) throw new Error('Choose a checklist item.');
        let itemId: string;
        if (checklistMode === 'existing') {
          if (!selectedItem) throw new Error('Checklist item was not found.');
          itemId = selectedItem.id;
        } else {
          itemId = crypto.randomUUID();
          const checklistBlocks = appendChecklistItemToTipTap(selectedParent.checklistBlocks, {
            id: itemId, text: title,
          });
          const ok = await updateTask(selectedParent.id, { checklistBlocks });
          if (!ok) throw new Error('Checklist item could not be saved. No new schedule was created.');
        }
        source = { sourceType: 'checklist_item', taskId: selectedParent.id, checklistItemId: itemId };
      }
      // Always create a schedule for a dated checklist (including all-day);
      // a dated Action without an hour still follows its existing dueDate flow.
      if (effectiveDate && (kind === 'checklist' || effectiveTime)) {
        const schedule: PendingSchedule = {
          source, title, scheduleDate: effectiveDate,
          scheduleTime: effectiveTime || null,
          durationMinutes: effectiveTime ? duration : null,
        };
        try {
          await saveTimeBlock(schedule);
        } catch {
          setPendingSchedule(schedule);
          resetInput();
          toast.warning('The item is saved, but its calendar block needs a retry. No duplicate item will be created.');
          return;
        }
      }
      resetInput();
      toast.success(kind === 'checklist' ? 'Checklist item planned' : effectiveDate ? 'Action added to Planner' : 'Action added to Anytime');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save Planner item.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void submit(); }}
      className="planner-v2-capture overflow-hidden rounded-[22px] border border-border/60 bg-card/65 p-3 shadow-[0_18px_42px_-34px_hsl(var(--foreground)/0.4)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Quick capture</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Plan a small step, or create a larger Action.</p>
        </div>
        <div className="inline-flex rounded-xl border border-border/70 bg-muted/45 p-1" role="group" aria-label="New Planner entry type">
          <button type="button" aria-pressed={kind === 'checklist'} disabled={locked}
            onClick={() => { setKind('checklist'); setValue(''); setDate(null); setTime(''); }}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${kind === 'checklist' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <CheckSquare2 className="h-3.5 w-3.5" aria-hidden /> Checklist item
          </button>
          <button type="button" aria-pressed={kind === 'action'} disabled={locked}
            onClick={() => { setKind('action'); setValue(''); setDate(null); setTime(''); }}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${kind === 'action' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Layers3 className="h-3.5 w-3.5" aria-hidden /> Action
          </button>
        </div>
      </div>

      {kind === 'checklist' && (
        <div className="mb-3 grid gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1.5 text-xs font-semibold" htmlFor="planner-parent">
            <span className="flex items-center gap-1.5"><FolderKanban className="h-3.5 w-3.5 text-primary" aria-hidden /> Under which Action?</span>
            <select id="planner-parent" value={selectedParent?.id ?? ''} disabled={locked}
              onChange={(event) => chooseParent(event.target.value)}
              className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <option value="">Choose an existing Action…</option>
              {parents.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1 rounded-lg bg-background/70 p-1 text-[11px] font-medium">
            <button type="button" disabled={locked} aria-pressed={checklistMode === 'new'}
              onClick={() => { setChecklistMode('new'); setValue(''); }}
              className={`min-h-8 rounded-md px-2.5 ${checklistMode === 'new' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>New item</button>
            <button type="button" disabled={locked} aria-pressed={checklistMode === 'existing'}
              onClick={() => { setChecklistMode('existing'); setValue(''); }}
              className={`min-h-8 rounded-md px-2.5 ${checklistMode === 'existing' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>Existing item</button>
          </div>
          {!parents.length && <p className="text-xs text-amber-600 sm:col-span-2">Create an Action first. It can hold many independently scheduled checklist items.</p>}
        </div>
      )}

      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {kind === 'checklist' ? <CheckSquare2 className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        </span>
        {kind === 'checklist' && checklistMode === 'existing' ? (
          <select value={selectedItem?.id ?? ''} disabled={locked || !selectedParent}
            onChange={(event) => setExistingId(event.target.value)} aria-label="Choose checklist item"
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <option value="">Choose an unchecked checklist item…</option>
            {availableItems.map((item) => <option key={item.id} value={item.id}>{item.text}</option>)}
          </select>
        ) : (
          <Input ref={titleRef} value={value} onChange={(event) => setValue(event.target.value)} disabled={locked}
            placeholder={kind === 'checklist' ? 'e.g. Wash clothes, review invoice…' : 'Create a new Action…'}
            aria-label={kind === 'checklist' ? 'New checklist item' : 'Quick add Action'}
            className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0" />
        )}
        <Button type="submit" size="icon" disabled={locked || !validInput} className="h-11 w-11 shrink-0 rounded-xl" aria-label={kind === 'checklist' ? 'Plan checklist item' : 'Add Action'}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        </Button>
      </div>

      <div className="planner-v2-capture-controls mt-2 flex flex-wrap items-center gap-2 px-1 pb-1">
        <label className="planner-v2-chip"><CalendarPlus className="h-3.5 w-3.5" aria-hidden />
          <input type="date" value={effectiveDate ?? ''} min={today} disabled={locked}
            onChange={(event) => setDate(event.target.value || (kind === 'checklist' ? today : null))}
            aria-label="Planned date" className="w-[7.8rem] bg-transparent text-xs outline-none disabled:opacity-50" />
        </label>
        <label className="planner-v2-chip"><Clock3 className="h-3.5 w-3.5" aria-hidden />
          <input type="time" value={effectiveTime} disabled={!effectiveDate || locked}
            onChange={(event) => setTime(event.target.value)} aria-label="Planned time"
            className="w-[4.5rem] bg-transparent text-xs outline-none disabled:opacity-45" />
        </label>
        {effectiveTime && (
          <select value={duration} disabled={locked} onChange={(event) => setDuration(Number(event.target.value))}
            aria-label="Duration" className="planner-v2-chip h-9 bg-transparent text-xs outline-none disabled:opacity-50">
            {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
          </select>
        )}
        <span className="text-[11px] text-muted-foreground">
          {kind === 'checklist' ? (!effectiveTime ? 'All-day checklist · today by default' : 'Calendar time block')
            : !effectiveDate ? 'No date → Anytime' : effectiveTime ? 'Timed Action' : 'Scheduled Action'}
        </span>
      </div>
      {kind === 'checklist' && (
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
          Checklist items stay inside their parent Action but appear separately in Today and Calendar when scheduled. No extra Process is created.
        </p>
      )}
      {pendingSchedule && (
        <div className="planner-v2-capture-recovery" role="alert">
          <AlertCircle aria-hidden="true" />
          <span><strong>{pendingSchedule.title}</strong> was saved, but its calendar block needs a retry.</span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void retrySchedule()}>
            <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Retry schedule
          </Button>
        </div>
      )}
    </form>
  );
}
