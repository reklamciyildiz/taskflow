'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkSchedulePicker } from '@/components/schedule/WorkSchedulePicker';
import { plannerApi, scheduleApi } from '@/lib/api';
import type { WorkSchedule, WorkSource } from '@/lib/scheduling-domain';
import type { PlannerProjectionItem } from '@/lib/planner-projection';
import { dispatchOccurrenceChanged } from '@/lib/schedule-events';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';

export function PlannerScheduleDialog({ open, onOpenChange, source, title, occurrence = null, onSaved, onOpenSource }: {
  open: boolean; onOpenChange: (open: boolean) => void; source: WorkSource | null;
  title: string; occurrence?: PlannerProjectionItem | null; onSaved?: () => void; onOpenSource?: () => void;
}) {
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [occurrenceDate, setOccurrenceDate] = useState('');
  const [occurrenceBusy, setOccurrenceBusy] = useState(false);
  useEffect(() => {
    if (open) setOccurrenceDate(occurrence?.effectiveDate ?? '');
  }, [occurrence?.effectiveDate, open]);
  useEffect(() => {
    if (!open || !source) return;
    let active = true; setLoading(true);
    void scheduleApi.get(source).then((response) => {
      if (active) setSchedule(response.success ? response.data ?? null : null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, source && JSON.stringify(source)]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutateOccurrence = async (action: 'skip' | 'reschedule') => {
    if (!occurrence || occurrenceBusy) return;
    setOccurrenceBusy(true);
    try {
      const response = await plannerApi.mutateOccurrence({
        scheduleId: occurrence.scheduleId,
        occurrenceDate: occurrence.occurrenceDate,
        action,
        effectiveDate: action === 'reschedule' ? occurrenceDate : undefined,
      });
      if (!response.success) throw new Error(response.error || 'The occurrence could not be updated.');
      dispatchOccurrenceChanged(occurrence.scheduleId, occurrence.occurrenceDate);
      toast.success(action === 'skip' ? 'Occurrence skipped.' : 'Occurrence moved.');
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The occurrence could not be updated.');
    } finally {
      setOccurrenceBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex max-h-[92dvh] min-h-0 w-[min(92vw,390px)] max-w-[min(92vw,390px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border/40 px-4 py-3 text-left">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm">{title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-[11px]">Edit this schedule{occurrence ? ' or its occurrence' : ''}.</DialogDescription>
          </div>
          {onOpenSource ? (
            <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0" onClick={onOpenSource}>
              Open Action <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          ) : null}
        </DialogHeader>
        {loading || !source ? <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-48" /></div> : (
          <>
            {schedule?.scheduleType === 'recurring' ? (
              <div className="space-y-2 border-b border-border/40 bg-primary/5 px-4 py-3">
                <p className="text-xs font-medium text-primary">This is a recurring schedule.</p>
                {occurrence ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      value={occurrenceDate}
                      onChange={(event) => setOccurrenceDate(event.target.value)}
                      className="h-9 min-w-[9rem] flex-1 bg-background/70 text-xs"
                      aria-label="New date for this occurrence"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={occurrenceBusy || !occurrenceDate || occurrenceDate === occurrence.effectiveDate}
                      onClick={() => void mutateOccurrence('reschedule')}
                    >
                      Move this date
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={occurrenceBusy}
                      onClick={() => void mutateOccurrence('skip')}
                    >
                      Skip
                    </Button>
                  </div>
                ) : null}
                <p className="text-[11px] text-muted-foreground">Changes in the schedule editor below apply to the whole series.</p>
              </div>
            ) : null}
            <WorkSchedulePicker source={source} initialSchedule={schedule}
              onOptimisticScheduleChange={setSchedule}
              onScheduleChange={(next) => { setSchedule(next); onSaved?.(); }}
              onRequestClose={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
