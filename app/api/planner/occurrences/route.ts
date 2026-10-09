import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import {
  SchedulingAccessError,
  completeOccurrence,
  getOccurrenceState,
  rescheduleOccurrence,
  skipOccurrence,
  uncompleteOccurrence,
} from '@/lib/work-schedule-server';
import { SchedulingValidationError } from '@/lib/scheduling-domain';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const scheduleId = params.get('scheduleId') ?? '';
    const occurrenceDate = params.get('occurrenceDate') ?? '';
    if (!scheduleId || !occurrenceDate) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'scheduleId and occurrenceDate are required' },
        { status: 400 },
      );
    }
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const data = await getOccurrenceState({
      userId: String(authed.user.id),
      organizationId: String(authed.user.organization_id),
      role: authed.user.role,
    }, scheduleId, occurrenceDate);
    return NextResponse.json<ApiResponse<typeof data>>({ success: true, data });
  } catch (error) {
    return occurrenceError(error);
  }
}

function occurrenceError(error: unknown) {
  if (error instanceof SchedulingValidationError) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message },
      { status: 400 },
    );
  }
  if (error instanceof SchedulingAccessError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 409;
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message },
      { status },
    );
  }
  console.error('Error updating Planner occurrence:', error);
  return NextResponse.json<ApiResponse<null>>(
    { success: false, error: 'Could not update occurrence' },
    { status: 500 },
  );
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const scheduleId = typeof body?.scheduleId === 'string' ? body.scheduleId : '';
    const occurrenceDate = typeof body?.occurrenceDate === 'string' ? body.occurrenceDate : '';
    const action = typeof body?.action === 'string'
      ? body.action
      : typeof body?.completed === 'boolean'
        ? body.completed ? 'complete' : 'uncomplete'
        : '';
    if (!scheduleId || !occurrenceDate || !action) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'scheduleId, occurrenceDate and action are required' },
        { status: 400 },
      );
    }

    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const actor = {
      userId: String(authed.user.id),
      organizationId: String(authed.user.organization_id),
      role: authed.user.role,
    };
    const occurrence = action === 'complete'
      ? await completeOccurrence(actor, scheduleId, occurrenceDate)
      : action === 'uncomplete'
        ? await uncompleteOccurrence(actor, scheduleId, occurrenceDate)
        : action === 'skip'
          ? await skipOccurrence(actor, scheduleId, occurrenceDate)
          : action === 'reschedule' && typeof body?.effectiveDate === 'string'
            ? await rescheduleOccurrence(actor, scheduleId, occurrenceDate, body.effectiveDate)
            : (() => { throw new SchedulingValidationError('Invalid occurrence action'); })();
    return NextResponse.json<ApiResponse<{ occurrence: unknown }>>({
      success: true,
      data: { occurrence },
    });
  } catch (error) {
    return occurrenceError(error);
  }
}
