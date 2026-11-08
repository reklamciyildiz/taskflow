import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { organizationDb, userDb } from '@/lib/db';
import { publicOrganizationRow } from '@/lib/public-identity-projection';

// GET - Get organization by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;

    const actor = authed.user;
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
      data: publicOrganizationRow(organization),
    });
  } catch (error: any) {
    console.error('Organization lookup failed');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
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
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;

    // Get current user
    const user = await userDb.getById(authed.user.id);
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
      data: publicOrganizationRow(updatedOrganization),
      message: 'Organization updated successfully',
    });
  } catch (error: any) {
    console.error('Organization update failed');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
