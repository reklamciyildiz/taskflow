import { NextRequest, NextResponse } from 'next/server';
import { cronRemindersUnauthorizedResponse } from '@/lib/cron-reminders-guard';
import { processScheduledReminders } from '@/lib/process-scheduled-reminders';

/**
 * Absolute scheduled reminders (ISO instants on tasks + checklist rows).
 *
 * Prefer `/api/cron/reminders-tick` for production (runs scheduled + due together).
 * This route remains for backwards compatibility and GitHub Actions links.
 */
export async function GET(request: NextRequest) {
  const denied = cronRemindersUnauthorizedResponse(request);
  if (denied) return denied;

  try {
    const stats = await processScheduledReminders();
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    console.error('cron scheduled reminders failed', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

