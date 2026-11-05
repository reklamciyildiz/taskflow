import { stageErrorMessage } from '@/lib/stage-server';
import { NextRequest, NextResponse } from 'next/server';
import { projectDb, teamMemberDb, teamDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { getOrganizationEntitlements, getPlanLimits } from '@/lib/entitlements';
import { requireAuthedUser } from '@/lib/server-authz';

// GET /api/projects — list projects for the signed-in user's organization
export async function GET(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user: any = authed.user;
    const { searchParams } = new URL(request.url);
    const organizationIdParam = searchParams.get('organizationId');
    const teamIdParam = searchParams.get('teamId');

    if (!user?.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const userId: string = user.id;
    const organizationId: string | null = user.organization_id ?? null;
    if (!organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Organization required' }, { status: 403 });
    }
    if (organizationIdParam && organizationIdParam !== organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' }, { status: 403 });
    }
    const isOrgAdmin = user.role === 'admin' || user.role === 'owner';

    // Visibility-filtered listing for the current user.
    const teamId = typeof teamIdParam === 'string' && teamIdParam ? teamIdParam : null;
    if (teamId) {
      const scopedTeam = await teamDb.getById(teamId);
      if (!scopedTeam || scopedTeam.organization_id !== organizationId) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' }, { status: 403 });
      }
    }
    if (teamId && !isOrgAdmin) {
      const mem = await teamMemberDb.getMembership(teamId, userId);
      if (!mem) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    }
    const projects = await projectDb.getVisibleForUser({
      organizationId,
      teamId,
      userId,
    });

    return NextResponse.json<ApiResponse<unknown>>({
      success: true,
      data: projects,
    });
  } catch (error) {
    const stageError = stageErrorMessage(error);
    if (stageError) return NextResponse.json({ success: false, error: stageError }, { status: 400 });
    console.error('Error fetching projects:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects — create a new project (process/pipeline) in the signed-in user's organization
export async function POST(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const user: any = authed.user;
    const body = await request.json().catch(() => null);

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const teamId = typeof body?.teamId === 'string' ? body.teamId : null;
    const columnConfig = body?.columnConfig;
    const organizationIdParam = typeof body?.organizationId === 'string' ? body.organizationId : null;
    const visibility =
      body?.visibility === 'team' || body?.visibility === 'restricted' || body?.visibility === 'private'
        ? body.visibility
        : undefined;

    if (!name) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }

    if (!user?.id || !user.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Authenticated organization required' }, { status: 403 });
    }
    const organizationId: string = user.organization_id;
    const createdBy: string = user.id;
    if (organizationIdParam && organizationIdParam !== organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (teamId) {
      const scopedTeam = await teamDb.getById(teamId);
      if (!scopedTeam || scopedTeam.organization_id !== organizationId) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Team is outside this organization' }, { status: 403 });
      }
    }

    // Entitlement gate: max processes per plan (Free/Pro limited; Team unlimited).
    const ent = await getOrganizationEntitlements(organizationId);
    const limits = getPlanLimits(ent);
    if (Number.isFinite(limits.maxProcesses) && limits.maxProcesses !== Number.POSITIVE_INFINITY) {
      const existingCount = await projectDb.countByOrganization(organizationId);
      if (existingCount >= limits.maxProcesses) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: `Process limit reached (${limits.maxProcesses}). Upgrade to create more processes.`,
            code: 'PAYWALL_PROCESSES',
            recommendedPlan: ent.plan === 'free' ? 'pro' : 'team',
          },
          { status: 402 }
        );
      }
    }

    // Authorization:
    // - Team-scoped project: team admin (or org admin)
    // - General (no team): org admin
    const isOrgAdmin = user.role === 'admin' || user.role === 'owner';
    if (teamId) {
      const mem = await teamMemberDb.getMembership(teamId, user.id);
      if (mem?.role !== 'admin' && !isOrgAdmin) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    } else {
      if (!isOrgAdmin) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    const created = await projectDb.create({
      name,
      organization_id: organizationId,
      team_id: teamId,
      column_config: columnConfig,
      visibility,
      created_by: createdBy,
    });

    return NextResponse.json<ApiResponse<unknown>>({
      success: true,
      data: created,
    });
  } catch (error) {
    const stageError = stageErrorMessage(error);
    if (stageError) return NextResponse.json({ success: false, error: stageError }, { status: 400 });
    console.error('Error creating project:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
