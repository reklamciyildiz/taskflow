import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { teamMemberDb, userDb } from '@/lib/db';

/**
 * Lets the current user leave their organization only when they are the sole member.
 * Use case: user created a personal workspace by mistake and needs to accept an invite elsewhere.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await userDb.getByEmail(session.user.email);
    if (!user?.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'You are not currently connected to an organization.',
          code: 'NO_ORG',
        },
        { status: 400 }
      );
    }

    const orgId = user.organization_id;
    const members = await userDb.getByOrganization(orgId);

    if (!members || members.length !== 1 || members[0].id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This workspace has other members, or your account is not eligible for this action. Contact your admin or support.',
          code: 'NOT_SOLO',
        },
        { status: 409 }
      );
    }

    await teamMemberDb.removeUserFromOrganizationTeams(user.id, orgId);
    await userDb.update(user.id, {
      organization_id: null,
      role: 'member',
    });

    return NextResponse.json({
      success: true,
      message:
        'You left your personal workspace. You can now use the invite link again or refresh the page.',
    });
  } catch (error: unknown) {
    console.error('reset-solo-workspace error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not complete the request' },
      { status: 500 }
    );
  }
}
