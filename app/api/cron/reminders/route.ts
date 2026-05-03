import { NextRequest, NextResponse } from 'next/server';
import { cronRemindersUnauthorizedResponse } from '@/lib/cron-reminders-guard';
import { processTaskDueReminders } from '@/lib/process-task-reminders';

/**
 * Due-date bucket reminders (task + checklist row due dates, UTC day granularity).
 *
 * Prefer `GET /api/cron/reminders-tick` for production (runs scheduled + due together).
 * This route remains for backwards compatibility and external cron links.
 *
 * Configure `CRON_SECRET` and call with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const denied = cronRemindersUnauthorizedResponse(request);
  if (denied) return denied;

  try {
    const stats = await processTaskDueReminders();
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    console.error('cron reminders failed', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
