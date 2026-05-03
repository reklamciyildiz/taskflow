import { NextRequest, NextResponse } from 'next/server';

/**
 * Shared auth for reminder cron routes (Vercel Cron + optional Bearer secret).
 * - If `CRON_SECRET` is set: require `Authorization: Bearer <CRON_SECRET>`.
 * - Else in production: allow only Vercel Cron user-agent (documented as `vercel-cron/1.0`).
 */
export function cronRemindersUnauthorizedResponse(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const ua = request.headers.get('user-agent') || '';

  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    return null;
  }

  if (process.env.NODE_ENV === 'production') {
    const isVercelCronUa = /^vercel-cron\/\d+/i.test(ua.trim());
    if (!isVercelCronUa) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  return null;
}
