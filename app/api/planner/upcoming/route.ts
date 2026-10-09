import { NextRequest, NextResponse } from 'next/server';
import { getPlannerUpcomingProjection } from '@/lib/planner-retrieval-server';
import { requireAuthedUser, requireTeamMemberOrOrgAdmin } from '@/lib/server-authz';
import { SchedulingValidationError } from '@/lib/scheduling-domain';
import type { PlannerUpcomingProjection } from '@/lib/planner-projection';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const startDate = params.get('startDate') ?? '';
    const teamId = params.get('teamId') ?? '';
    const horizonDays = Number(params.get('horizonDays') ?? '14');
    if (!startDate || !teamId || !Number.isInteger(horizonDays)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'startDate, teamId and horizonDays are required' },
        { status: 400 },
      );
    }

    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamMemberOrOrgAdmin(teamId, authed);
    if (access instanceof NextResponse) return access;

    const data = await getPlannerUpcomingProjection({
      userId: String(authed.user.id),
      organizationId: String(authed.user.organization_id),
      role: authed.user.role,
    }, startDate, horizonDays, { teamId });
    return NextResponse.json<ApiResponse<PlannerUpcomingProjection>>({ success: true, data });
  } catch (error) {
    if (error instanceof SchedulingValidationError || error instanceof Error && error.message.includes('horizonDays')) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
    console.error('Error loading Planner Upcoming:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Could not load Planner Upcoming' },
      { status: 500 },
    );
  }
}
