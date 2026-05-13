import { NextRequest, NextResponse } from 'next/server';
import { teamDb, teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { requireAuthedUser, requireTeamAdminOrOrgAdmin, requireTeamMemberOrOrgAdmin } from '@/lib/server-authz';
import { canInviteMembers, getOrganizationEntitlements, getOrganizationSeatUsage } from '@/lib/entitlements';

// GET /api/teams/[id]/members - Get all members of a team
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamMemberOrOrgAdmin(params.id, authed);
    if (access instanceof NextResponse) return access;

    const members = await teamMemberDb.getByTeam(params.id);

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: members,
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/teams/[id]/members - Add a member to a team
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const access = await requireTeamAdminOrOrgAdmin(params.id, authed);
    if (access instanceof NextResponse) return access;

    const body = await request.json();

    if (!body.userId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const targetUser: any = await userDb.getById(body.userId);
    if (!targetUser) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User not found' }, { status: 404 });
    }
    if (!targetUser.organization_id || targetUser.organization_id !== access.team.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Cannot add user from a different organization' },
        { status: 403 }
      );
    }

    const orgId = String(access.team.organization_id ?? '');
    const ent = await getOrganizationEntitlements(orgId);
    if (!canInviteMembers(ent)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Adding members is not available on the current plan.', code: 'PAYWALL_INVITES' as any },
        { status: 402 }
      );
    }
    if (Number.isFinite(ent.seatLimit) && ent.seatLimit !== Number.POSITIVE_INFINITY) {
      const rows = await teamMemberDb.listDistinctUsersForOrganization(orgId);
      const alreadyCounted = rows.some((r) => r.user_id === body.userId);
      if (!alreadyCounted) {
        const used = await getOrganizationSeatUsage(orgId);
        if (used >= ent.seatLimit) {
          return NextResponse.json<ApiResponse<null>>(
            {
              success: false,
              error: `Seat limit reached (${ent.seatLimit}). Add seats in billing before adding members.`,
              code: 'PAYWALL_SEATS' as any,
            },
            { status: 402 }
          );
        }
      }
    }

    // Check if member is already in this team
    const existingMembership = await teamMemberDb.getMembership(params.id, body.userId);
    if (existingMembership) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Member is already in this team' },
        { status: 400 }
      );
    }

    const member = await teamMemberDb.add(
      params.id,
      body.userId,
      body.role || 'member'
    );

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: member,
      message: 'Member added successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding member:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
