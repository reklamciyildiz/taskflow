import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { projectDb, teamMemberDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';

// GET /api/projects — list projects for the signed-in user's organization
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const organizationIdParam = searchParams.get('organizationId');
    const teamIdParam = searchParams.get('teamId');

    let organizationId = organizationIdParam;
    if (!session?.user?.email) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user?.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const userId: string = user.id;
    const isOrgAdmin = user.role === 'admin' || user.role === 'owner';

    if (!organizationId) organizationId = user.organization_id;
    if (!organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'organizationId or authenticated session required' },
        { status: 400 }
      );
    }

    // Prevent callers from listing projects across orgs.
    if (user.organization_id && organizationId !== user.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Visibility-filtered listing for the current user.
    const teamId = typeof teamIdParam === 'string' && teamIdParam ? teamIdParam : null;
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
    const session = await getServerSession(authOptions);
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

    let organizationId = organizationIdParam;
    let createdBy: string | null = null;
    if (!session?.user?.email) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    const user: any = await userDb.getByEmail(session.user.email);
    if (!user?.id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    createdBy = user.id;
    if (!organizationId) organizationId = user.organization_id;
    if (!organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'organizationId or authenticated session required' },
        { status: 400 }
      );
    }
    if (user.organization_id && organizationId !== user.organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
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
      column_config: Array.isArray(columnConfig) ? columnConfig : undefined,
      visibility,
      created_by: createdBy,
    });

    return NextResponse.json<ApiResponse<unknown>>({
      success: true,
      data: created,
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
