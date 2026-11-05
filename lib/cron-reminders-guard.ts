import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

/** Never authenticate a cron request by the caller-controlled User-Agent.
 * Vercel Cron automatically adds the Bearer CRON_SECRET header when configured.
 */
export function validReminderCronBearer(header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  if (supplied.length !== expected.length || supplied.length === 0) return false;
  return timingSafeEqual(supplied, expected);
}

export function cronRemindersUnauthorizedResponse(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Local development can run manual cron checks without a production secret.
    // Production MUST fail closed: User-Agent is spoofable and not authentication.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Cron authentication is not configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return null;
  }
  if (!validReminderCronBearer(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}
