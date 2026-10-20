import { NextRequest, NextResponse } from 'next/server';
import { getPlannerRoutinesProjection } from '@/lib/planner-retrieval-server';
import { requireAuthedUser, requireTeamScopeAccess } from '@/lib/server-authz';
import { SchedulingValidationError } from '@/lib/scheduling-domain';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const startDate = params.get('startDate') ?? '';
    const teamId = params.get('teamId') ?? '';
    if (!startDate || !teamId) return NextResponse.json({ success: false, error: 'startDate and teamId are required' }, { status: 400 });
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamScopeAccess(teamId, authed);
    if (access instanceof NextResponse) return access;
    const data = await getPlannerRoutinesProjection({
      userId: String(authed.user.id), organizationId: String(authed.user.organization_id), role: authed.user.role,
    }, startDate, { teamId, teamAccessVerified: true });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof SchedulingValidationError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    console.error('Error loading Planner routines:', error);
    return NextResponse.json({ success: false, error: 'Could not load routines' }, { status: 500 });
  }
}
