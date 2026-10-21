import { NextRequest } from 'next/server';
import { getPlannerTodayProjection } from '@/lib/planner-retrieval-server';
import { isIanaTimeZone } from '@/lib/scheduling-domain';
import {
  authenticateMobileRequest,
  MobileAuthError,
  mobileErrorResponse,
  mobileJson,
  mobileOptions,
} from '@/lib/mobile-auth/server';
import type { MobilePlannerItem, MobilePlannerToday } from '@/shared/mobile-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }

function serialize(item: any): MobilePlannerItem {
  return {
    id: String(item.id),
    scheduleId: String(item.scheduleId),
    taskId: String(item.taskId),
    taskTitle: String(item.taskTitle),
    sourceType: item.source.sourceType,
    checklistItemId: item.checklistItemId ? String(item.checklistItemId) : null,
    checklistItemText: item.checklistItemText ? String(item.checklistItemText) : null,
    processId: item.projectId ? String(item.projectId) : null,
    processName: item.projectName ? String(item.projectName) : null,
    effectiveDate: String(item.effectiveDate),
    occurrenceDate: String(item.occurrenceDate),
    scheduleTime: item.scheduleTime ? String(item.scheduleTime) : null,
    durationMinutes: item.durationMinutes === null ? null : Number(item.durationMinutes),
    state: item.state,
    recurring: Boolean(item.isRecurring),
    missedCount: Number(item.missedCount ?? 0),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await authenticateMobileRequest(request);
    if (!user.organization_id) throw new MobileAuthError('FORBIDDEN', 403, 'Organization required.');
    const params = new URL(request.url).searchParams;
    const date = params.get('date') ?? '';
    const timeZone = params.get('timeZone') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isIanaTimeZone(timeZone)) {
      throw new MobileAuthError('INVALID_REQUEST', 400, 'A valid date and IANA time zone are required.');
    }
    const projection = await getPlannerTodayProjection({
      userId: String(user.id),
      organizationId: String(user.organization_id),
      role: user.role ? String(user.role) : null,
    }, date, { timeZone });
    const data: MobilePlannerToday = {
      date: projection.date,
      overdue: projection.overdue.map(serialize),
      today: projection.today.map(serialize),
      completedToday: projection.completedToday.map(serialize),
    };
    return mobileJson(request, { success: true, data });
  } catch (error) { return mobileErrorResponse(request, error); }
}
