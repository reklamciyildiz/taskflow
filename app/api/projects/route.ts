import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { projectDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';

// GET /api/projects — list projects for the signed-in user's organization
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const organizationIdParam = searchParams.get('organizationId');

    let organizationId = organizationIdParam;

    if (!organizationId && session?.user?.email) {
      const user: { organization_id?: string } | null = await userDb.getByEmail(session.user.email);
      if (user?.organization_id) organizationId = user.organization_id;
    }

    if (!organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'organizationId or authenticated session required' },
        { status: 400 }
      );
    }

    const projects = await projectDb.getByOrganization(organizationId);

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

    if (!name) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }

    let organizationId = organizationIdParam;
    if (!organizationId && session?.user?.email) {
      const user: { organization_id?: string } | null = await userDb.getByEmail(session.user.email);
      if (user?.organization_id) organizationId = user.organization_id;
    }

    if (!organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'organizationId or authenticated session required' },
        { status: 400 }
      );
    }

    const created = await projectDb.create({
      name,
      organization_id: organizationId,
      team_id: teamId,
      column_config: Array.isArray(columnConfig) ? columnConfig : undefined,
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
