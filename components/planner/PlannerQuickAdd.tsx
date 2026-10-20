'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarPlus, Clock3, Loader2, Plus, RotateCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTaskContext } from '@/components/TaskContext';
import { formatDueDateYmdLocal, parseYmdDateInput } from '@/lib/due-date';
import { isTerminalBoardColumn } from '@/lib/types';
import { scheduleApi } from '@/lib/api';
import {
  dispatchScheduleChanged,
  PLANNER_CAPTURE_TIME_EVENT,
  type PlannerCaptureTimeDetail,
} from '@/lib/schedule-events';
import { parsePlannerCapture } from '@/lib/planner-v2-utils';

export function PlannerQuickAdd() {
  const { addTask, currentTeam, currentUser, generalBoardColumns } = useTaskContext();
  const today = formatDueDateYmdLocal(new Date());
  const [value, setValue] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [pendingSchedule, setPendingSchedule] = useState<{
    taskId: string;
    title: string;
    scheduleDate: string;
    scheduleTime: string;
    durationMinutes: number;
  } | null>(null);
  const parsed = useMemo(() => parsePlannerCapture(value, today), [today, value]);
  const effectiveDate = date ?? parsed.date;
  const effectiveTime = time || parsed.time || '';

  useEffect(() => {
    const selectCalendarTime = (event: Event) => {
      const detail = (event as CustomEvent<PlannerCaptureTimeDetail>).detail;
      if (!detail?.date || !detail.time || pendingSchedule) return;
      setDate(detail.date);
      setTime(detail.time);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => titleRef.current?.focus(), 250);
      toast.info(`Time selected: ${detail.time}`);
    };
    window.addEventListener(PLANNER_CAPTURE_TIME_EVENT, selectCalendarTime);
    return () => window.removeEventListener(PLANNER_CAPTURE_TIME_EVENT, selectCalendarTime);
  }, [pendingSchedule]);

  const saveTimeBlock = async (input: NonNullable<typeof pendingSchedule>) => {
    const response = await scheduleApi.save({
      source: { sourceType: 'action', taskId: input.taskId },
      scheduleType: 'one_off',
      scheduleDate: input.scheduleDate,
      scheduleTime: input.scheduleTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      durationMinutes: input.durationMinutes,
      reminderRules: [],
    });
    if (!response.success || !response.data) throw new Error(response.error || 'Time block could not be saved.');
    dispatchScheduleChanged({ sourceType: 'action', taskId: input.taskId }, response.data);
  };

  const retrySchedule = async () => {
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
  };

  const submit = async () => {
    if (!currentTeam || busy || !parsed.title.trim()) return;
    if (effectiveDate && effectiveDate < today) {
      toast.error('Choose today or a future date.');
      return;
    }
    setBusy(true);
    try {
      const initial = generalBoardColumns.find((column) => !isTerminalBoardColumn(column.id, generalBoardColumns))
        ?? generalBoardColumns[0];
      const task = await addTask({
        title: parsed.title.trim(), description: '', priority: 'medium', teamId: currentTeam.id,
        projectId: null, status: initial?.id ?? 'todo', createdBy: currentUser?.id ?? '',
        assigneeId: null, customerId: null,
        dueDate: effectiveDate ? parseYmdDateInput(effectiveDate) : undefined,
      });
      if (effectiveDate && effectiveTime) {
        const scheduleInput = {
          taskId: task.id,
          title: task.title,
          scheduleDate: effectiveDate,
          scheduleTime: effectiveTime,
          durationMinutes: duration,
        };
        try {
          await saveTimeBlock(scheduleInput);
          setPendingSchedule(null);
        } catch {
          setPendingSchedule(scheduleInput);
          toast.warning('Action was created, but the time block still needs to be retried.');
          setValue(''); setDate(null); setTime(''); setDuration(30);
          return;
        }
      } else if (effectiveDate && task.schedule) {
        dispatchScheduleChanged({ sourceType: 'action', taskId: task.id }, task.schedule);
      }
      setValue(''); setDate(null); setTime(''); setDuration(30);
      toast.success(effectiveDate ? 'Added to Planner' : 'Added to Anytime');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create Action');
    } finally { setBusy(false); }
  };

  return (
    <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void submit(); }}
      className="planner-v2-capture rounded-2xl border border-border/45 bg-card/45 p-2 shadow-[0_18px_42px_-34px_hsl(var(--foreground)/0.4)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
        <Input ref={titleRef} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy || pendingSchedule !== null}
          placeholder="Add an Action…"
          aria-label="Quick add Action"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0" />
        <Button type="submit" size="icon" disabled={busy || pendingSchedule !== null || !parsed.title.trim()} className="h-11 w-11 shrink-0 rounded-xl" aria-label="Add Action">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      <div className="planner-v2-capture-controls mt-2 flex flex-wrap items-center gap-2 px-1 pb-1">
        <label className="planner-v2-chip"><CalendarPlus className="h-3.5 w-3.5" />
          <input type="date" value={effectiveDate ?? ''} min={today} disabled={busy || pendingSchedule !== null} onChange={(event) => setDate(event.target.value || null)} className="w-[7.8rem] bg-transparent text-xs outline-none disabled:opacity-50" />
        </label>
        <label className="planner-v2-chip"><Clock3 className="h-3.5 w-3.5" />
          <input type="time" value={effectiveTime} disabled={!effectiveDate || busy || pendingSchedule !== null} onChange={(event) => setTime(event.target.value)} className="w-[4.5rem] bg-transparent text-xs outline-none disabled:opacity-45" />
        </label>
        {effectiveTime ? <select value={duration} disabled={busy || pendingSchedule !== null} onChange={(event) => setDuration(Number(event.target.value))} className="planner-v2-chip h-9 bg-transparent text-xs outline-none disabled:opacity-50">
          {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
        </select> : null}
        {parsed.date && !date ? <span className="text-[0.68rem] text-primary">Date detected</span> : null}
        {!effectiveDate ? <span className="text-[0.68rem] text-muted-foreground">No date → Anytime</span> : null}
        <span className="planner-v2-capture-hint text-[0.68rem] text-muted-foreground">Try “Tomorrow call the dentist”</span>
      </div>
      {pendingSchedule ? (
        <div className="planner-v2-capture-recovery" role="alert">
          <AlertCircle aria-hidden="true" />
          <span><strong>{pendingSchedule.title}</strong> was created, but its time block was not saved.</span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void retrySchedule()}>
            <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : null}
    </form>
  );
}
