import { NextRequest, NextResponse } from 'next/server';
import { cronRemindersUnauthorizedResponse } from '@/lib/cron-reminders-guard';
import { processScheduledReminders } from '@/lib/process-scheduled-reminders';
import { processTaskDueReminders } from '@/lib/process-task-reminders';

/**
 * Single entrypoint for all reminder processing:
 * 1) Absolute instants (`tasks.reminders`, checklist `journal_logs[*].reminders`) — needs frequent ticks for "5m before".
 * 2) Due-date buckets (overdue / today / tomorrow in UTC) — deduped; safe to run on the same cadence.
 *
 * Auth: see `cronRemindersUnauthorizedResponse`.
 *
 * Scheduling:
 * - Vercel Hobby: at most twice/day → use two crons in `vercel.json` (e.g. 08:00 & 20:00 UTC) + GitHub Actions for ~10m.
 * - Vercel Pro: prefer one high-frequency cron (e.g. every 5 or 10 minutes; see docs/REMINDERS_CRON.md for the exact expression).
 */
export async function GET(request: NextRequest) {
  const denied = cronRemindersUnauthorizedResponse(request);
  if (denied) return denied;

  try {
    const scheduled = await processScheduledReminders();
    const due = await processTaskDueReminders();
    return NextResponse.json({
      ok: true,
      stats: {
        scheduled,
        due,
      },
    });
  } catch (e) {
    console.error('cron reminders-tick failed', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
