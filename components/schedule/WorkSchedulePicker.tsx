'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarDays, Check, ChevronLeft, Clock3, Repeat2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDueDateYmdLocal, parseYmdDateInput } from '@/lib/due-date';
import { addCalendarDays, isoWeekday, type WorkSchedule, type WorkScheduleInput, type WorkSource } from '@/lib/scheduling-domain';
import { scheduleApi } from '@/lib/api';
import { REMINDER_PRESETS, type ReminderPresetId } from '@/lib/reminder-presets';
import { dispatchScheduleChanged } from '@/lib/schedule-events';
import {
  recurrenceLabel,
  reminderPresetFromRules,
  reminderRuleForPreset,
  scheduleChipLabel,
} from '@/lib/schedule-presentation';

type View = 'main' | 'calendar' | 'repeat' | 'reminder';
const DAY_OPTIONS = [
  { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' }, { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
];

export function WorkSchedulePicker({
  source,
  initialSchedule,
  disabled = false,
  canUseAdvancedReminderPresets = true,
  onScheduleChange,
  onOptimisticScheduleChange,
  onRequestClose,
}: {
  source: WorkSource;
  initialSchedule: WorkSchedule | null;
  disabled?: boolean;
  canUseAdvancedReminderPresets?: boolean;
  onScheduleChange?: (schedule: WorkSchedule | null) => void;
  onOptimisticScheduleChange?: (schedule: WorkSchedule | null) => void;
  onRequestClose?: () => void;
}) {
  const today = formatDueDateYmdLocal(new Date());
  const [schedule, setSchedule] = useState<WorkSchedule | null>(initialSchedule);
  const [view, setView] = useState<View>('main');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [repeatKind, setRepeatKind] = useState<'daily' | 'weekdays' | 'weekly' | 'custom'>(() => {
    if (!initialSchedule || initialSchedule.scheduleType !== 'recurring') return 'daily';
    if (initialSchedule.recurrenceFrequency === 'daily') return 'daily';
    if (initialSchedule.recurrenceWeekdays.join(',') === '1,2,3,4,5') return 'weekdays';
    if (initialSchedule.recurrenceWeekdays.length === 1) return 'weekly';
    return 'custom';
  });
  const [startDate, setStartDate] = useState(initialSchedule?.scheduleDate ?? today);
  const [endsOn, setEndsOn] = useState(initialSchedule?.endsOn ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(
    initialSchedule?.recurrenceWeekdays.length ? initialSchedule.recurrenceWeekdays : [isoWeekday(today)],
  );
  const reminderPreset = useMemo(
    () => reminderPresetFromRules(schedule?.reminderRules),
    [schedule?.reminderRules],
  );

  useEffect(() => {
    setSchedule(initialSchedule);
    if (!initialSchedule) return;
    setStartDate(initialSchedule.scheduleDate);
    setEndsOn(initialSchedule.endsOn ?? '');
    setWeekdays(initialSchedule.recurrenceWeekdays);
    setRepeatKind(
      initialSchedule.scheduleType !== 'recurring'
        ? 'daily'
        : initialSchedule.recurrenceFrequency === 'daily'
          ? 'daily'
          : initialSchedule.recurrenceWeekdays.join(',') === '1,2,3,4,5'
            ? 'weekdays'
            : initialSchedule.recurrenceWeekdays.length === 1
              ? 'weekly'
              : 'custom',
    );
  }, [initialSchedule]);

  const commit = async (input: WorkScheduleInput) => {
    if (disabled || savingRef.current) return false;
    const previous = schedule;
    const now = new Date().toISOString();
    const optimistic: WorkSchedule = {
      id: previous?.id ?? `optimistic:${source.sourceType}:${source.taskId}`,
      organizationId: previous?.organizationId ?? '',
      teamId: previous?.teamId ?? '',
      source,
      scheduleType: input.scheduleType,
      scheduleDate: input.scheduleDate,
      scheduleTime: input.scheduleTime ?? null,
      timeZone: input.timeZone ?? null,
      recurrenceFrequency: input.recurrenceFrequency ?? null,
      recurrenceInterval: input.recurrenceInterval ?? 1,
      recurrenceWeekdays: input.recurrenceWeekdays ?? [],
      endsOn: input.endsOn ?? null,
      reminderRules: input.reminderRules ?? [],
      archivedAt: null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    savingRef.current = true;
    setSaving(true);
    setSchedule(optimistic);
    setStartDate(optimistic.scheduleDate);
    setEndsOn(optimistic.endsOn ?? '');
    setWeekdays(optimistic.recurrenceWeekdays);
    onOptimisticScheduleChange?.(optimistic);
    const response = await scheduleApi.save(input).finally(() => {
      savingRef.current = false;
      setSaving(false);
    });
    if (!response.success || !response.data) {
      setSchedule(previous);
      onOptimisticScheduleChange?.(previous);
      toast.error(response.error || 'Could not save schedule');
      return false;
    }
    setSchedule(response.data);
    setStartDate(response.data.scheduleDate);
    setEndsOn(response.data.endsOn ?? '');
    setWeekdays(response.data.recurrenceWeekdays);
    onScheduleChange?.(response.data);
    dispatchScheduleChanged(source, response.data);
    return true;
  };

  const oneOff = (date: string) => commit({
    source,
    scheduleType: 'one_off',
    scheduleDate: date,
    scheduleTime: schedule?.scheduleTime ?? null,
    timeZone: schedule?.scheduleTime
      ? schedule.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
      : null,
    reminderRules: schedule?.reminderRules ?? [],
  });

  const applyRepeat = async () => {
    let recurrenceFrequency: 'daily' | 'weekly' = 'daily';
    let recurrenceWeekdays: number[] = [];
    if (repeatKind !== 'daily') {
      recurrenceFrequency = 'weekly';
      recurrenceWeekdays = repeatKind === 'weekdays'
        ? [1, 2, 3, 4, 5]
        : repeatKind === 'weekly'
          ? [isoWeekday(startDate)]
          : [...weekdays].sort((a, b) => a - b);
    }
    if (recurrenceFrequency === 'weekly' && recurrenceWeekdays.length === 0) {
      toast.error('Choose at least one weekday');
      return;
    }
    const request = commit({
      source,
      scheduleType: 'recurring',
      scheduleDate: startDate,
      scheduleTime: schedule?.scheduleTime ?? null,
      timeZone: schedule?.scheduleTime
        ? schedule.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
        : null,
      recurrenceFrequency,
      recurrenceInterval: 1,
      recurrenceWeekdays,
      endsOn: endsOn || null,
      reminderRules: schedule?.reminderRules ?? [],
    });
    setView('main');
    await request;
  };

  const remove = async () => {
    if (disabled || savingRef.current) return;
    const previous = schedule;
    savingRef.current = true;
    setSaving(true);
    setSchedule(null);
    onOptimisticScheduleChange?.(null);
    const response = await scheduleApi.remove(source).finally(() => {
      savingRef.current = false;
      setSaving(false);
    });
    if (!response.success) {
      setSchedule(previous);
      onOptimisticScheduleChange?.(previous);
      toast.error(response.error || 'Could not remove schedule');
      return;
    }
    setSchedule(null);
    onScheduleChange?.(null);
    dispatchScheduleChanged(source, null);
    toast.success('Schedule removed');
    onRequestClose?.();
  };

  const setTime = async (value: string) => {
    const baseDate = schedule?.scheduleDate ?? today;
    const base: WorkScheduleInput = schedule ? {
      source,
      scheduleType: schedule.scheduleType,
      scheduleDate: baseDate,
      recurrenceFrequency: schedule.recurrenceFrequency,
      recurrenceInterval: schedule.recurrenceInterval,
      recurrenceWeekdays: schedule.recurrenceWeekdays,
      endsOn: schedule.endsOn,
      reminderRules: schedule.reminderRules,
    } : { source, scheduleType: 'one_off', scheduleDate: baseDate, reminderRules: [] };
    await commit({
      ...base,
      scheduleTime: value || null,
      timeZone: value ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : null,
    });
  };

  const title = view === 'main' ? 'Schedule' : view === 'calendar' ? 'Pick date' : view === 'repeat' ? 'Repeat' : 'Reminder';
  return (
    <div className="flex max-h-[min(82dvh,650px)] min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          {view !== 'main' ? (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView('main')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : <span className="w-8" />}
          <p className="text-xs font-medium">{title}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRequestClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {view === 'main' ? (
          <div className="space-y-1">
            {schedule ? (
              <div className="mb-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <p className="text-xs font-medium text-primary">{scheduleChipLabel(schedule)}</p>
                {schedule.scheduleType === 'recurring' ? <p className="mt-0.5 text-[11px] text-muted-foreground">Starts {scheduleChipLabel({ ...schedule, scheduleType: 'one_off', recurrenceFrequency: null, recurrenceWeekdays: [], endsOn: null })}</p> : null}
              </div>
            ) : null}
            <button className="schedule-menu-row" disabled={saving || disabled} onClick={() => void oneOff(today)}>
              <CalendarDays className="h-4 w-4" /><span>Today</span>
            </button>
            <button className="schedule-menu-row" disabled={saving || disabled} onClick={() => void oneOff(addCalendarDays(today, 1))}>
              <CalendarDays className="h-4 w-4" /><span>Tomorrow</span>
            </button>
            <button className="schedule-menu-row" disabled={saving || disabled} onClick={() => setView('calendar')}>
              <CalendarDays className="h-4 w-4" /><span>Pick date</span>
            </button>
            <button className="schedule-menu-row" disabled={saving || disabled} onClick={() => setView('repeat')}>
              <Repeat2 className="h-4 w-4" /><span>Repeat…</span>
              {schedule?.scheduleType === 'recurring' ? <span className="ml-auto text-[11px] text-primary">{recurrenceLabel(schedule)}</span> : null}
            </button>
            <div className="my-2 border-t border-border/50" />
            <label className="schedule-menu-row cursor-pointer">
              <Clock3 className="h-4 w-4" /><span>Time</span>
              <Input
                type="time"
                value={schedule?.scheduleTime?.slice(0, 5) ?? ''}
                disabled={saving || disabled}
                onChange={(event) => void setTime(event.target.value)}
                className="ml-auto h-7 w-28 border-0 bg-muted/40 text-xs"
              />
            </label>
            <button className="schedule-menu-row" disabled={saving || disabled || !schedule} onClick={() => setView('reminder')}>
              <Bell className="h-4 w-4" /><span>Reminder</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {REMINDER_PRESETS.find((preset) => preset.id === reminderPreset)?.label ?? 'Off'}
              </span>
            </button>
            {schedule ? (
              <button className="schedule-menu-row mt-2 text-destructive" disabled={saving || disabled} onClick={() => void remove()}>
                <Trash2 className="h-4 w-4" /><span>Remove schedule</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {view === 'calendar' ? (
          <Calendar
            mode="single"
            selected={parseYmdDateInput(schedule?.scheduleDate ?? startDate)}
            onSelect={(selected) => {
              if (!selected) return;
              setView('main');
              void oneOff(formatDueDateYmdLocal(selected));
            }}
            initialFocus
          />
        ) : null}

        {view === 'repeat' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(['daily', 'weekdays', 'weekly', 'custom'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={cn('rounded-lg border px-3 py-2 text-left text-xs capitalize', repeatKind === kind ? 'border-primary/60 bg-primary/10' : 'border-border/60 hover:bg-muted/30')}
                  onClick={() => setRepeatKind(kind)}
                >
                  {kind === 'custom' ? 'Custom weekdays' : kind}
                </button>
              ))}
            </div>
            {repeatKind === 'custom' ? (
              <div className="flex flex-wrap gap-1.5">
                {DAY_OPTIONS.map(({ day, label }) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])}
                    className={cn('h-8 rounded-md border px-2 text-xs', weekdays.includes(day) ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border/60')}
                  >{label}</button>
                ))}
              </div>
            ) : null}
            <label className="block space-y-1 text-xs"><span className="text-muted-foreground">Start date</span><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="block space-y-1 text-xs"><span className="text-muted-foreground">End date <span className="opacity-60">(optional)</span></span><Input type="date" min={startDate} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
            <Button className="w-full" disabled={saving || disabled || !startDate} onClick={() => void applyRepeat()}>
              {saving ? 'Saving…' : 'Apply repeat'}
            </Button>
          </div>
        ) : null}

        {view === 'reminder' ? (
          <div className="space-y-1">
            {REMINDER_PRESETS.map((preset) => {
              const locked = preset.id !== 'when_due' && !canUseAdvancedReminderPresets;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={cn('schedule-menu-row', reminderPreset === preset.id && 'bg-primary/10 text-foreground', locked && 'opacity-50')}
                  onClick={async () => {
                    if (!schedule) return;
                    if (locked) return toast.message('Upgrade to Pro to unlock advanced reminders.');
                    const request = commit({
                      source,
                      scheduleType: schedule.scheduleType,
                      scheduleDate: schedule.scheduleDate,
                      scheduleTime: schedule.scheduleTime,
                      timeZone: schedule.timeZone,
                      recurrenceFrequency: schedule.recurrenceFrequency,
                      recurrenceInterval: schedule.recurrenceInterval,
                      recurrenceWeekdays: schedule.recurrenceWeekdays,
                      endsOn: schedule.endsOn,
                      reminderRules: reminderRuleForPreset(preset.id as ReminderPresetId),
                    });
                    setView('main');
                    await request;
                  }}
                >
                  <Bell className="h-4 w-4" /><span>{preset.label}</span>
                  {reminderPreset === preset.id ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                </button>
              );
            })}
            <button className="schedule-menu-row" onClick={async () => {
              if (!schedule) return;
              const request = commit({
                source,
                scheduleType: schedule.scheduleType,
                scheduleDate: schedule.scheduleDate,
                scheduleTime: schedule.scheduleTime,
                timeZone: schedule.timeZone,
                recurrenceFrequency: schedule.recurrenceFrequency,
                recurrenceInterval: schedule.recurrenceInterval,
                recurrenceWeekdays: schedule.recurrenceWeekdays,
                endsOn: schedule.endsOn,
                reminderRules: [],
              });
              setView('main');
              await request;
            }}><X className="h-4 w-4" /><span>Clear reminder</span></button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
