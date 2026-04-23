import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { organizationDb, userDb, teamMemberDb } from '@/lib/db';

// GET - Get organization by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const actor: any = await userDb.getByEmail(session.user.email);
    if (!actor?.organization_id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Only allow reading your own organization (or org admin for their org).
    if (String(actor.organization_id) !== String(params.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const organization = await organizationDb.getById(params.id);
    
    if (!organization) {
      return NextResponse.json(
        { success: false, error: 'Organization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: organization,
    });
  } catch (error: any) {
    console.error('Get organization error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update organization (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current user
    const user = await userDb.getByEmail(session.user.email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user belongs to this organization
    if (user.organization_id !== params.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Not your organization' },
        { status: 403 }
      );
    }

    // Check if user is admin (owner role in DB is also treated as admin)
    if (user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const { name } = await request.json();

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Organization name is required' },
        { status: 400 }
      );
    }

    const updatedOrganization = await organizationDb.update(params.id, { name: name.trim() });

    return NextResponse.json({
      success: true,
      data: updatedOrganization,
      message: 'Organization updated successfully',
    });
  } catch (error: any) {
    console.error('Update organization error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
