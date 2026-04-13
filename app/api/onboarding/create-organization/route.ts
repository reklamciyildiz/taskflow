import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createUserWithOrganization, userDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { name } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Organization name is required' },
        { status: 400 }
      );
    }

    const existing = await userDb.getByEmail(session.user.email);
    if (existing?.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You are already connected to an organization. To create a new workspace, you must first leave your current membership (or use a different account).',
          code: 'ALREADY_IN_ORG',
        },
        { status: 409 }
      );
    }

    const result = await createUserWithOrganization(
      session.user.email,
      session.user.name || session.user.email.split('@')[0],
      name.trim(),
      (session.user as any).image || undefined
    );

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Failed to create organization' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        organization: result.organization,
        user: result.user,
        team: result.team,
      },
      message: 'Organization created successfully',
    });
  } catch (error: any) {
    console.error('Create organization error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
