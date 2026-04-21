import { NextRequest, NextResponse } from 'next/server';
import { processTaskDueReminders } from '@/lib/process-task-reminders';

/**
 * Scheduled reminders for task due dates + checklist row due dates.
 *
 * Configure `CRON_SECRET` and call with `Authorization: Bearer <CRON_SECRET>`.
 * On Vercel, add a Cron Job pointing at this route (see `vercel.json`).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const ua = request.headers.get('user-agent') || '';

  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Without CRON_SECRET, restrict execution to Vercel's Cron invocations.
    // Vercel documents `User-Agent: vercel-cron/1.0` for cron-triggered requests.
    const isVercelCronUa = /^vercel-cron\/\d+/i.test(ua.trim());
    if (!isVercelCronUa) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const stats = await processTaskDueReminders();
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    console.error('cron reminders failed', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
