import { NextRequest, NextResponse } from 'next/server';
import { cronRemindersUnauthorizedResponse } from '@/lib/cron-reminders-guard';
import { processScheduledReminders } from '@/lib/process-scheduled-reminders';
import { processTaskDueReminders } from '@/lib/process-task-reminders';

/**
 * Single entrypoint for all reminder processing:
 * 1) Absolute instants from work_schedules reminder rules — needs frequent ticks for "5m before".
 * 2) Due-date buckets (overdue / today / tomorrow in the recipient's IANA time zone) — deduped; safe on the same cadence.
 *
 * Auth: see `cronRemindersUnauthorizedResponse`.
 *
 * Scheduling:
 * - Vercel Hobby: at most twice/day → use two crons in `vercel.json` (e.g. 08:00 & 20:00 UTC) + GitHub Actions for ~10m.
 * - Vercel Pro: prefer one high-frequency cron (e.g. every 5 or 10 minutes; see docs/REMINDERS_CRON.md for the exact expression).
 */
// cron-job.org normally disconnects after 30 seconds; execution duration
// must also be monitored at the scheduler, independently of Vercel's limit.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = cronRemindersUnauthorizedResponse(request);
  if (denied) return denied;

  try {
    const startedAt = performance.now();
    // Both processors must run, even when one fails. A partial failure is
    // reported as non-2xx so the scheduler/monitoring can alert and retry.
    const [scheduledResult, dueResult] = await Promise.allSettled([
      processScheduledReminders(),
      processTaskDueReminders(),
    ]);
    const failed = [
      ...(scheduledResult.status === 'rejected' ? ['scheduled'] : []),
      ...(dueResult.status === 'rejected' ? ['due'] : []),
    ];
    for (const component of failed) console.error('Reminder cron processor failed:', component);
    const response = NextResponse.json({
      ok: failed.length === 0,
      ranAt: new Date().toISOString(),
      ...(failed.length ? { error: 'A reminder processor failed', failed } : {}),
      stats: {
        scheduled: scheduledResult.status === 'fulfilled' ? scheduledResult.value : null,
        due: dueResult.status === 'fulfilled' ? dueResult.value : null,
      },
    }, { status: failed.length ? 503 : 200 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Server-Timing', `total;dur=${(performance.now() - startedAt).toFixed(1)}`);
    return response;
  } catch (e) {
    console.error('cron reminders-tick failed', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
