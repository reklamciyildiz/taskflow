import { NextRequest, NextResponse } from 'next/server';
import { getPlannerTodayProjection } from '@/lib/planner-retrieval-server';
import { requireAuthedUser, requireTeamMemberOrOrgAdmin } from '@/lib/server-authz';
import { SchedulingValidationError, isIanaTimeZone } from '@/lib/scheduling-domain';
import type { PlannerTodayProjection } from '@/lib/planner-projection';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const date = params.get('date') ?? '';
    const teamId = params.get('teamId') ?? '';
    const timeZone = params.get('timeZone') ?? '';
    if (!date || !teamId || !timeZone || !isIanaTimeZone(timeZone)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'date, teamId and a valid IANA timeZone are required' },
        { status: 400 },
      );
    }

    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamMemberOrOrgAdmin(teamId, authed);
    if (access instanceof NextResponse) return access;

    const data = await getPlannerTodayProjection(
      {
        userId: String(authed.user.id),
        organizationId: String(authed.user.organization_id),
        role: authed.user.role,
      },
      date,
      { teamId, timeZone },
    );
    return NextResponse.json<ApiResponse<PlannerTodayProjection>>({ success: true, data });
  } catch (error) {
    if (error instanceof SchedulingValidationError) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
    console.error('Error loading Planner Today:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Could not load Planner Today' },
      { status: 500 },
    );
  }
}
