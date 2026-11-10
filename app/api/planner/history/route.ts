import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { SchedulingValidationError } from '@/lib/scheduling-domain';
import { SchedulingAccessError, getRecurrenceHistory } from '@/lib/work-schedule-server';
import type { RecurrenceHistory } from '@/lib/recurrence-history';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** No user-controlled organization scope. Canonical schedule ACL is mandatory. */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const scheduleId = params.get('scheduleId') ?? '';
    const timeZone = params.get('timeZone') ?? '';
    const window = params.get('days') ?? '30';
    if (!/^[0-9a-fA-F-]{36}$/.test(scheduleId) || !timeZone || !['7', '30'].includes(window)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'A valid schedule, time zone and 7/30-day window are required' },
        { status: 400 },
      );
    }
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const data = await getRecurrenceHistory({
      userId: String(authed.user.id),
      organizationId: String(authed.user.organization_id),
      role: authed.user.role,
    }, scheduleId, timeZone, window === '7' ? 7 : 30);
    const response = NextResponse.json<ApiResponse<RecurrenceHistory>>({ success: true, data });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof SchedulingValidationError) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof SchedulingAccessError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 409;
      return NextResponse.json<ApiResponse<null>>({ success: false, error: error.message }, { status });
    }
    console.error('Error retrieving recurrence history', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Could not load recurrence history' }, { status: 500 },
    );
  }
}
