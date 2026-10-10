import { NextRequest, NextResponse } from 'next/server';
import { getPlannerUpcomingProjection } from '@/lib/planner-retrieval-server';
import { requireAuthedUser, requireTeamScopeAccess } from '@/lib/server-authz';
import { SchedulingValidationError } from '@/lib/scheduling-domain';
import type { PlannerUpcomingProjection } from '@/lib/planner-projection';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
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

    const authStartedAt = performance.now();
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const authDuration = performance.now() - authStartedAt;
    const accessStartedAt = performance.now();
    const access = await requireTeamScopeAccess(teamId, authed);
    if (access instanceof NextResponse) return access;
    const accessDuration = performance.now() - accessStartedAt;

    const timings = {};
    const retrievalStartedAt = performance.now();
    const data = await getPlannerUpcomingProjection({
      userId: String(authed.user.id),
      organizationId: String(authed.user.organization_id),
      role: authed.user.role,
    }, startDate, horizonDays, { teamId, teamAccessVerified: true, timings });
    const retrievalDuration = performance.now() - retrievalStartedAt;
    const response = NextResponse.json<ApiResponse<PlannerUpcomingProjection>>({ success: true, data });
    response.headers.set(
      'Server-Timing',
      [
        `auth;dur=${authDuration.toFixed(1)}`,
        `scope;dur=${accessDuration.toFixed(1)}`,
        `schedules;dur=${Number((timings as any).schedulesMs ?? 0).toFixed(1)}`,
        `sources;dur=${Number((timings as any).sourcesMs ?? 0).toFixed(1)}`,
        `visibility;dur=${Number((timings as any).visibilityMs ?? 0).toFixed(1)}`,
        `projection;dur=${Number((timings as any).projectionMs ?? 0).toFixed(1)}`,
        `retrieval;dur=${retrievalDuration.toFixed(1)}`,
        `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
      ].join(', '),
    );
    return response;
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
