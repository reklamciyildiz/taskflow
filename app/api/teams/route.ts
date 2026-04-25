import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { teamDb, teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { getOrganizationEntitlements, getPlanLimits, isPaidActive } from '@/lib/entitlements';

// GET /api/teams - Get all teams (optionally filtered by userId or organizationId)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const organizationId = searchParams.get('organizationId');

    let teams;
    if (userId) {
      teams = await teamDb.getByUser(userId);
    } else if (organizationId) {
      // Only org admins can list all teams in an org.
      if (!session?.user?.email) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      const user: any = await userDb.getByEmail(session.user.email);
      if (!user?.organization_id || user.organization_id !== organizationId) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      if (user.role !== 'admin' && user.role !== 'owner') {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      teams = await teamDb.getByOrganization(organizationId);
    } else if (session?.user?.email) {
      const user: any = await userDb.getByEmail(session.user.email);
      if (user) {
        // Default: only list teams this user is actually a member of.
        // Org admins can still see all via ?organizationId=.
        teams = await teamDb.getByUser(user.id);
      }
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: teams || [],
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Team name is required' },
        { status: 400 }
      );
    }

    // Get user from session
    let userId = body.createdBy;
    let organizationId = body.organizationId;

    if (session?.user?.email) {
      const user: any = await userDb.getByEmail(session.user.email);
      if (user) {
        userId = user.id;
        organizationId = user.organization_id;
      }
    }

    if (!userId || !organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User authentication required' },
        { status: 401 }
      );
    }

    // Entitlement gate: max teams per plan (Free/Pro limited; Team unlimited).
    const ent = await getOrganizationEntitlements(organizationId);
    const limits = getPlanLimits(ent);
    if (!isPaidActive(ent.subscriptionStatus) && ent.plan !== 'free') {
      // Defensive: if plan_name says paid but subscription isn't active, treat as Free limits.
      // getPlanLimits already does this, but keep message clear for edge cases.
    }
    if (Number.isFinite(limits.maxTeams) && limits.maxTeams !== Number.POSITIVE_INFINITY) {
      const existingCount = await teamDb.countByOrganization(organizationId);
      if (existingCount >= limits.maxTeams) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: `Team limit reached (${limits.maxTeams}). Upgrade to create more workspaces.`,
            code: 'PAYWALL_TEAMS',
            recommendedPlan: ent.plan === 'free' ? 'pro' : 'team',
          },
          { status: 402 }
        );
      }
    }

    // Create team
    const team: any = await teamDb.create({
      name: body.name,
      description: body.description || null,
      organization_id: organizationId,
      created_by: userId,
    });

    // Add creator as admin member
    await teamMemberDb.add(team.id, userId, 'admin');

    // Get updated team with members
    const updatedTeam: any = await teamDb.getById(team.id);

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: updatedTeam,
      message: 'Team created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
