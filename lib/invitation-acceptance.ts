import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Every invite acceptance must be a single database transaction. A client-side
 * count-then-insert cannot serialize two invitations and can create orphan users.
 * Only authenticated server paths or the verified invite-registration flow call
 * this helper; the database RPC is executable by service_role alone.
 */
export class InvitationAcceptError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InvitationAcceptError';
  }
}

type AcceptedInvitation = {
  userId: string;
  organizationId: string;
  alreadyMember: boolean;
};

type Input = {
  token: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  /** Only for first-time credentials registration; never replace an existing hash. */
  passwordHash?: string | null;
};

function safeInviteFailure(error: { message?: string; code?: string }): InvitationAcceptError {
  const message = String(error.message ?? '');
  if (message.includes('ACTIPROC_INVITE_EMAIL_MISMATCH'))
    return new InvitationAcceptError('INVITE_EMAIL_MISMATCH', 403, 'Invitation is for a different email');
  if (message.includes('ACTIPROC_INVITE_TEAM_INVALID'))
    return new InvitationAcceptError('INVITE_TEAM_INVALID', 409, 'Invitation team is no longer available');
  if (message.includes('ACTIPROC_USER_OTHER_ORG'))
    return new InvitationAcceptError('OTHER_ORG', 400, 'You already belong to another organization');
  if (message.includes('ACTIPROC_SEAT_LIMIT'))
    return new InvitationAcceptError('PAYWALL_SEATS', 402, 'The organization has reached its seat limit');
  if (message.includes('ACTIPROC_INVITE_INVALID'))
    return new InvitationAcceptError('INVITE_INVALID', 404, 'Invalid, expired or already used invitation');
  if (message.includes('ACTIPROC_PASSWORD_HASH_INVALID'))
    return new InvitationAcceptError('INVALID_PASSWORD_HASH', 400, 'Invalid registration credentials');
  if (error.code === '23505')
    return new InvitationAcceptError('USER_EXISTS', 409, 'An account already exists for this email');
  // A missing/unapplied production RPC is NOT a reason to fall back to an
  // unsafe sequence of service-role inserts. Fail closed.
  console.error('[invitations] atomic accept failed', { code: error.code ?? 'UNKNOWN' });
  return new InvitationAcceptError('INVITE_UNAVAILABLE', 503, 'Secure invitations are temporarily unavailable');
}

export async function acceptInvitationAtomic(input: Input): Promise<AcceptedInvitation> {
  const token = input.token?.trim().toUpperCase();
  const email = input.email?.trim().toLowerCase();
  if (!token || !email || !email.includes('@'))
    throw new InvitationAcceptError('INVITE_INVALID', 400, 'Invitation code and email are required');

  const { data, error } = await (supabaseAdmin as any).rpc('accept_actiproc_invitation', {
    p_token: token,
    p_email: email,
    p_name: input.name?.trim() || email.split('@')[0],
    p_avatar_url: input.avatarUrl ?? null,
    p_password_hash: input.passwordHash ?? null,
  });
  if (error) throw safeInviteFailure(error);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.user_id !== 'string' || typeof row.organization_id !== 'string')
    throw new InvitationAcceptError('INVITE_UNAVAILABLE', 503, 'Secure invitation confirmation unavailable');

  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    alreadyMember: row.already_member === true,
  };
}
