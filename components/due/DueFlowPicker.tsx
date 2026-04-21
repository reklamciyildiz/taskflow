'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Bell, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { REMINDER_PRESETS, computeReminderInstantsUtcIso, detectReminderPreset, type ReminderPresetId } from '@/lib/reminder-presets';

type View = 'main' | 'time' | 'remind';

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function addLocalDays(base: Date, delta: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

function formatTimeLabel(hhmm: string) {
  if (!hhmm) return 'No time';
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const isPm = h >= 12;
  const h12 = ((h + 11) % 12) + 1;
  return mm === 0 ? `${h12} ${isPm ? 'PM' : 'AM'}` : `${h12}:${String(mm).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`;
}

function timeSlots(stepMinutes = 30): string[] {
  const out: string[] = [''];
  const step = Math.max(5, Math.min(60, stepMinutes));
  for (let mins = 0; mins < 24 * 60; mins += step) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return out;
}

function dueToTimeKey(dueAt: Date | null): string {
  if (!dueAt) return '';
  const hh = String(dueAt.getHours()).padStart(2, '0');
  const mm = String(dueAt.getMinutes()).padStart(2, '0');
  // treat noon as "no time" for date-only flows
  if (hh === '12' && mm === '00') return '';
  return `${hh}:${mm}`;
}

function applyTime(base: Date, hhmm: string): Date {
  if (!hhmm) return startOfLocalDay(base);
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return startOfLocalDay(base);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(m[1]), Number(m[2]), 0, 0);
}

export type DueFlowPickerProps = {
  value: Date | null;
  reminders: string[] | null;
  disabled?: boolean;
  onChange: (nextDueAt: Date | null) => void;
  onRemindersChange: (next: string[] | null) => void;
  onRequestClose?: () => void;
};

export function DueFlowPicker({ value, reminders, disabled, onChange, onRemindersChange, onRequestClose }: DueFlowPickerProps) {
  const [view, setView] = useState<View>('main');

  const timeKey = useMemo(() => dueToTimeKey(value), [value]);
  const preset = useMemo(() => detectReminderPreset({ dueAt: value, reminders }), [value, reminders]);

  const setDueAndRecomputeReminders = useCallback(
    (nextDue: Date | null, keepPreset: ReminderPresetId | null) => {
      onChange(nextDue);
      if (!keepPreset || !nextDue) {
        onRemindersChange([]);
        return;
      }
      onRemindersChange(computeReminderInstantsUtcIso({ dueAt: nextDue, preset: keepPreset }));
    },
    [onChange, onRemindersChange]
  );

  const header = useMemo(() => {
    const title = view === 'main' ? 'Due' : view === 'time' ? 'Time' : 'Remind me';
    return (
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          {view !== 'main' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={disabled}
              onClick={() => setView('main')}
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <span className="w-8" aria-hidden />
          )}
          <p className="text-[12px] font-medium text-foreground">{title}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onRequestClose?.()}
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    );
  }, [view, disabled, onRequestClose]);

  const main = (
    <div className="px-3 py-2">
      <div className="flex flex-wrap gap-2 pb-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setDueAndRecomputeReminders(startOfLocalDay(new Date()), preset)}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setDueAndRecomputeReminders(startOfLocalDay(addLocalDays(new Date(), 1)), preset)}
        >
          Tomorrow
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setDueAndRecomputeReminders(startOfLocalDay(addLocalDays(new Date(), 7)), preset)}
        >
          Next week
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 bg-background/40">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => {
            if (disabled) return;
            if (!d) return;
            const next = applyTime(startOfLocalDay(d), timeKey);
            setDueAndRecomputeReminders(next, preset);
          }}
          initialFocus
        />
      </div>

      <div className="mt-2 space-y-1">
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm',
            'hover:bg-muted/40 transition-colors',
            disabled && 'pointer-events-none opacity-50'
          )}
          onClick={() => setView('time')}
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>Time</span>
          </span>
          <span className="text-muted-foreground">{formatTimeLabel(timeKey)}</span>
        </button>

        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm',
            'hover:bg-muted/40 transition-colors',
            disabled && 'pointer-events-none opacity-50'
          )}
          onClick={() => setView('remind')}
        >
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>Remind me</span>
          </span>
          <span className="truncate text-muted-foreground">
            {preset ? REMINDER_PRESETS.find((p) => p.id === preset)?.label : 'Off'}
          </span>
        </button>
      </div>
    </div>
  );

  const time = (
    <div className="px-3 py-2">
      <div className="space-y-1">
        {timeSlots(30).map((t) => (
          <button
            key={t || '__none__'}
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors',
              t === timeKey ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/40 text-muted-foreground',
              disabled && 'pointer-events-none opacity-50'
            )}
            onClick={() => {
              if (disabled) return;
              const base = value ? startOfLocalDay(value) : startOfLocalDay(new Date());
              const next = applyTime(base, t);
              setDueAndRecomputeReminders(next, preset);
              setView('main');
            }}
          >
            <span>{t ? formatTimeLabel(t) : 'No time'}</span>
            {t === timeKey && <ChevronRight className="h-4 w-4 text-primary" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );

  const remind = (
    <div className="px-3 py-2">
      <div className="space-y-1">
        {REMINDER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors',
              preset === p.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/40 text-muted-foreground',
              (disabled || !value) && 'pointer-events-none opacity-50'
            )}
            onClick={() => {
              if (disabled || !value) return;
              onRemindersChange(computeReminderInstantsUtcIso({ dueAt: value, preset: p.id }));
              setView('main');
            }}
          >
            <span>{p.label}</span>
            {preset === p.id && <ChevronRight className="h-4 w-4 text-primary" aria-hidden />}
          </button>
        ))}
        <button
          type="button"
          className={cn(
            'mt-2 flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors',
            'hover:bg-muted/40 text-muted-foreground',
            disabled && 'pointer-events-none opacity-50'
          )}
          onClick={() => {
            onRemindersChange([]);
            setView('main');
          }}
        >
          <span>Clear reminder</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 w-full max-h-[min(78dvh,620px)] flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {view === 'main' ? main : view === 'time' ? time : remind}
      </div>
      <div className="shrink-0 flex items-center gap-2 border-t border-border/50 bg-muted/20 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={disabled || !value}
          onClick={() => {
            setView('main');
            onChange(null);
            onRemindersChange([]);
          }}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="flex-1"
          onClick={() => onRequestClose?.()}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

