import { NextRequest, NextResponse } from 'next/server';
import { processScheduledReminders } from '@/lib/process-scheduled-reminders';

/**
 * Frequent scheduled reminders (absolute instants, "Remind me" presets).
 *
 * Configure `CRON_SECRET` and call with `Authorization: Bearer <CRON_SECRET>`.
 * Without CRON_SECRET in production, restrict to Vercel Cron UA.
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
    const isVercelCronUa = /^vercel-cron\/\d+/i.test(ua.trim());
    if (!isVercelCronUa) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const stats = await processScheduledReminders();
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    console.error('cron scheduled reminders failed', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

