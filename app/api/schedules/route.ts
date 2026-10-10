import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import {
  SchedulingAccessError,
  removeWorkScheduleForSource,
  resolveScheduleForSource,
  saveWorkScheduleForSource,
} from '@/lib/work-schedule-server';
import {
  SchedulingValidationError,
  type WorkScheduleInput,
  type WorkSource,
} from '@/lib/scheduling-domain';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

function sourceFromValues(taskId: unknown, checklistItemId: unknown): WorkSource {
  const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : '';
  const normalizedChecklistId = typeof checklistItemId === 'string' ? checklistItemId.trim() : '';
  return normalizedChecklistId
    ? { sourceType: 'checklist_item', taskId: normalizedTaskId, checklistItemId: normalizedChecklistId }
    : { sourceType: 'action', taskId: normalizedTaskId };
}

async function actor() {
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;
  return {
    userId: String(authed.user.id),
    organizationId: String(authed.user.organization_id),
    role: authed.user.role,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof SchedulingValidationError) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: error.message }, { status: 400 });
  }
  if (error instanceof SchedulingAccessError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 409;
    return NextResponse.json<ApiResponse<null>>({ success: false, error: error.message }, { status });
  }
  console.error('Schedule API error:', error);
  return NextResponse.json<ApiResponse<null>>(
    { success: false, error: 'Could not update schedule' },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const identity = await actor();
    if (identity instanceof NextResponse) return identity;
    const params = new URL(request.url).searchParams;
    const source = sourceFromValues(params.get('taskId'), params.get('checklistItemId'));
    const schedule = await resolveScheduleForSource(identity, source);
    return NextResponse.json<ApiResponse<typeof schedule>>({ success: true, data: schedule });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  const startedAt = performance.now();
  try {
    const authStartedAt = performance.now();
    const identity = await actor();
    if (identity instanceof NextResponse) return identity;
    const authDuration = performance.now() - authStartedAt;
    const body = await request.json();
    const source = sourceFromValues(body?.taskId, body?.checklistItemId);
    const input: WorkScheduleInput = {
      source,
      scheduleType: body?.scheduleType,
      scheduleDate: body?.scheduleDate,
      scheduleTime: body?.scheduleTime ?? null,
      timeZone: body?.timeZone ?? null,
      recurrenceFrequency: body?.recurrenceFrequency ?? null,
      recurrenceInterval: body?.recurrenceInterval ?? 1,
      recurrenceWeekdays: body?.recurrenceWeekdays ?? [],
      endsOn: body?.endsOn ?? null,
      reminderRules: body?.reminderRules ?? [],
    };
    const mutationStartedAt = performance.now();
    const timings = {};
    const schedule = await saveWorkScheduleForSource(identity, input, timings);
    const mutationDuration = performance.now() - mutationStartedAt;
    const response = NextResponse.json<ApiResponse<typeof schedule>>({ success: true, data: schedule });
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDuration.toFixed(1)}, source;dur=${Number((timings as any).sourceAccessMs ?? 0).toFixed(1)}, lookup;dur=${Number((timings as any).lookupMs ?? 0).toFixed(1)}, write;dur=${Number((timings as any).writeMs ?? 0).toFixed(1)}, schedule;dur=${mutationDuration.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`,
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const startedAt = performance.now();
  try {
    const authStartedAt = performance.now();
    const identity = await actor();
    if (identity instanceof NextResponse) return identity;
    const authDuration = performance.now() - authStartedAt;
    const params = new URL(request.url).searchParams;
    const source = sourceFromValues(params.get('taskId'), params.get('checklistItemId'));
    const mutationStartedAt = performance.now();
    const timings = {};
    await removeWorkScheduleForSource(identity, source, timings);
    const mutationDuration = performance.now() - mutationStartedAt;
    const response = NextResponse.json<ApiResponse<null>>({ success: true, data: null });
    response.headers.set(
      'Server-Timing',
      `auth;dur=${authDuration.toFixed(1)}, source;dur=${Number((timings as any).sourceAccessMs ?? 0).toFixed(1)}, lookup;dur=${Number((timings as any).lookupMs ?? 0).toFixed(1)}, write;dur=${Number((timings as any).writeMs ?? 0).toFixed(1)}, schedule;dur=${mutationDuration.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`,
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
