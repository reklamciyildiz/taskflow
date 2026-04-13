'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Target } from 'lucide-react';
import { toast } from 'sonner';

const KEY = 'taskflow:dailyIntent';

function todayKey(d = new Date()): string {
  // YYYY-MM-DD in local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Stored = { date: string; text: string };

export function DailyIntent() {
  // IMPORTANT: "today" depends on user's local timezone. Avoid computing it during SSR
  // to prevent hydration mismatches on Vercel (UTC) vs client locale.
  const [today, setToday] = useState<string>('');
  const [value, setValue] = useState('');
  const lastToastedValueRef = useRef<string>('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToday(todayKey());
  }, []);

  useEffect(() => {
    if (!today) return;
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      const v =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Partial<Stored>)
          : null;
      if (v?.date === today && typeof v.text === 'string') {
        setValue(v.text);
      } else {
        setValue('');
      }
    } catch {
      setValue('');
    }
  }, [today]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!today) return;
    try {
      const payload: Stored = { date: today, text: value };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [today, value]);

  return (
    <Card className="mb-4 border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-r from-amber-50/70 via-background to-orange-50/70 dark:from-amber-950/20 dark:via-background dark:to-orange-950/10">
      <CardContent className="py-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100/90">
          <Target className="h-4 w-4" />
          <p className="text-sm font-semibold">Today’s focus</p>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums" suppressHydrationWarning>
            {today}
          </span>
        </div>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onBlur={() => {
            const normalized = value.trim();
            if (normalized === lastToastedValueRef.current) return;
            lastToastedValueRef.current = normalized;
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            // Small debounce to avoid toast spam when focus toggles quickly
            toastTimerRef.current = setTimeout(() => {
              toast.success('Saved');
            }, 250);
          }}
          placeholder="e.g. 3 applications + 1 mock interview + 1 deep work block"
          className="bg-background"
          aria-label="Today’s focus"
        />
        <p className="text-xs text-muted-foreground">
          This is stored locally (localStorage). Set a new focus each day.
        </p>
      </CardContent>
    </Card>
  );
}

