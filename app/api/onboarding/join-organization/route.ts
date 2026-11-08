import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { userDb } from '@/lib/db';
import { acceptInvitationAtomic, InvitationAcceptError } from '@/lib/invitation-acceptance';

/**
 * The invitation, seat allocation, user assignment and team membership must
 * commit together. Never restore check-then-create API writes as a fallback:
 * the Production database RPC is the concurrency and payment boundary.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  let inviteCode: unknown;
  try {
    ({ inviteCode } = await request.json());
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid invitation request', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }
  if (typeof inviteCode !== 'string' || !inviteCode.trim()) {
    return NextResponse.json(
      { success: false, error: 'Invite code is required', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  try {
    const result = await acceptInvitationAtomic({
      token: inviteCode,
      // Never accept a submitted email or user ID as proof of invite ownership.
      email: session.user.email,
      name: session.user.name || session.user.email.split('@')[0],
      avatarUrl: (session.user as { image?: string | null }).image ?? null,
    });
    const user = await userDb.getById(result.userId);
    return NextResponse.json({
      success: true,
      data: {
        // Do not return password_hash or any internal billing/profile columns.
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
          role: user.role,
          organization_id: user.organization_id,
        },
        organizationId: result.organizationId,
      },
      message: result.alreadyMember
        ? 'You are already a member of this organization'
        : 'Successfully joined organization',
    });
  } catch (error) {
    if (error instanceof InvitationAcceptError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error('[invitations] unexpected join error');
    return NextResponse.json(
      { success: false, error: 'Unable to join organization', code: 'INVITE_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
