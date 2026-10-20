'use client';

import { useMemo, useState } from 'react';
import { CalendarPlus, Clock3, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTaskContext } from '@/components/TaskContext';
import { formatDueDateYmdLocal, parseYmdDateInput } from '@/lib/due-date';
import { isTerminalBoardColumn } from '@/lib/types';
import { scheduleApi } from '@/lib/api';
import { dispatchScheduleChanged } from '@/lib/schedule-events';
import { parsePlannerCapture } from '@/lib/planner-v2-utils';

export function PlannerQuickAdd() {
  const { addTask, currentTeam, currentUser, generalBoardColumns } = useTaskContext();
  const today = formatDueDateYmdLocal(new Date());
  const [value, setValue] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parsePlannerCapture(value, today), [today, value]);
  const effectiveDate = date ?? parsed.date;
  const effectiveTime = time || parsed.time || '';

  const submit = async () => {
    if (!currentTeam || busy || !parsed.title.trim()) return;
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
        const response = await scheduleApi.save({
          source: { sourceType: 'action', taskId: task.id }, scheduleType: 'one_off',
          scheduleDate: effectiveDate, scheduleTime: effectiveTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          durationMinutes: duration, reminderRules: [],
        });
        if (!response.success || !response.data) {
          toast.warning('Action was created for the selected day, but its time block could not be saved.');
        } else dispatchScheduleChanged({ sourceType: 'action', taskId: task.id }, response.data);
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
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}
      className="planner-v2-capture rounded-2xl border border-border/45 bg-card/45 p-2 shadow-[0_18px_42px_-34px_hsl(var(--foreground)/0.4)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
        <Input value={value} onChange={(event) => setValue(event.target.value)} disabled={busy}
          placeholder="Quick add — e.g. Tomorrow call the dentist"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0" />
        <Button type="submit" size="icon" disabled={busy || !parsed.title.trim()} className="h-11 w-11 shrink-0 rounded-xl"><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 px-1 pb-1">
        <label className="planner-v2-chip"><CalendarPlus className="h-3.5 w-3.5" />
          <input type="date" value={effectiveDate ?? ''} min={today} onChange={(event) => setDate(event.target.value || null)} className="w-[7.8rem] bg-transparent text-xs outline-none" />
        </label>
        <label className="planner-v2-chip"><Clock3 className="h-3.5 w-3.5" />
          <input type="time" value={effectiveTime} disabled={!effectiveDate} onChange={(event) => setTime(event.target.value)} className="w-[4.5rem] bg-transparent text-xs outline-none disabled:opacity-45" />
        </label>
        {effectiveTime ? <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="planner-v2-chip h-9 bg-transparent text-xs outline-none">
          {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
        </select> : null}
        {parsed.date && !date ? <span className="text-[0.68rem] text-primary">Date detected</span> : null}
        {!effectiveDate ? <span className="text-[0.68rem] text-muted-foreground">No date → Anytime</span> : null}
      </div>
    </form>
  );
}
