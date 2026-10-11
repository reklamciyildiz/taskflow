import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import {
  captureMissingUserTimeZone,
  normalizeIanaTimeZone,
} from '@/lib/user-time-zone-server';

export async function POST(request: NextRequest) {
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;
  try {
    const body = await request.json();
    const timeZone = normalizeIanaTimeZone(body?.timeZone);
    if (!timeZone) {
      return NextResponse.json({ success: false, error: 'Invalid IANA time zone' }, { status: 400 });
    }
    const captured = await captureMissingUserTimeZone(String(authed.user.id), timeZone);
    return NextResponse.json({ success: true, data: { captured } });
  } catch (error) {
    console.error('Could not capture user time zone', error);
    return NextResponse.json({ success: false, error: 'Could not save time zone' }, { status: 500 });
  }
}
