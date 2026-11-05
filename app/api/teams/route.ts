import { NextRequest, NextResponse } from 'next/server';
import { teamDb, teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { getOrganizationEntitlements, getPlanLimits } from '@/lib/entitlements';
import { isOrgAdmin, requireAuthedUser } from '@/lib/server-authz';

// Resolve both reads and writes from the authenticated user, never request-body identities.
export async function GET(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const actor = authed.user;
    if (!actor.organization_id) return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Organization required' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    const requestedOrgId = searchParams.get('organizationId');
    const admin = isOrgAdmin(actor);
    if (requestedOrgId && (requestedOrgId !== actor.organization_id || !admin)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (targetUserId && targetUserId !== actor.id) {
      if (!admin) return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' }, { status: 403 });
      const target = await userDb.getById(targetUserId);
      if (!target || target.organization_id !== actor.organization_id) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' }, { status: 403 });
      }
    }
    const teams = requestedOrgId
      ? await teamDb.getByOrganization(actor.organization_id)
      : await teamDb.getByUser(targetUserId || actor.id);
    // Historical memberships must not leak a different organization.
    const safe = (teams ?? []).filter((team: any) =>
      String(team?.organization_id ?? '') === actor.organization_id);
    return NextResponse.json<ApiResponse<any>>({ success: true, data: safe });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const actor = authed.user;
    if (!actor.organization_id || !isOrgAdmin(actor)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Only organization admins can create teams' }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 120) return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Team name must be 1–120 characters' }, { status: 400 });

    const ent = await getOrganizationEntitlements(actor.organization_id);
    const limits = getPlanLimits(ent);
    if (Number.isFinite(limits.maxTeams)) {
      const existing = await teamDb.countByOrganization(actor.organization_id);
      if (existing >= limits.maxTeams) return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Team limit reached (' + limits.maxTeams + '). Upgrade to create more workspaces.',
          code: 'PAYWALL_TEAMS', recommendedPlan: ent.plan === 'free' ? 'pro' : 'team' },
        { status: 402 });
    }

    const team = await teamDb.create({
      name,
      description: typeof body?.description === 'string' ? body.description.slice(0, 1000) : null,
      organization_id: actor.organization_id,
      created_by: actor.id,
    });
    await teamMemberDb.add(team.id, actor.id, 'admin');
    const updated = await teamDb.getById(team.id);
    return NextResponse.json<ApiResponse<any>>(
      { success: true, data: updated, message: 'Team created successfully' },
      { status: 201 });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' }, { status: 500 });
  }
}
