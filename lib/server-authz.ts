import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { ApiResponse } from '@/lib/types';
import { teamDb, teamMemberDb, userDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

type DbUser = {
  id: string;
  email?: string | null;
  organization_id?: string | null;
  role?: string | null;
};

export type AuthedContext = {
  user: DbUser;
};

export async function requireAuthedUser(): Promise<AuthedContext | NextResponse<ApiResponse<null>>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const user: any = await userDb.getByEmail(session.user.email);
  if (!user?.id) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  return { user };
}

export function isOrgAdmin(user: DbUser): boolean {
  const r = (user.role ?? '').toString();
  return r === 'admin' || r === 'owner';
}

/** Authenticate + require org admin/owner role. Returns 403 for regular members. */
export async function requireOrgAdmin(): Promise<AuthedContext | NextResponse<ApiResponse<null>>> {
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;
  if (!isOrgAdmin(authed.user)) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Forbidden: admin access required' },
      { status: 403 }
    );
  }
  return authed;
}

export async function requireTeamMemberOrOrgAdmin(
  teamId: string,
  authed: AuthedContext
): Promise<{ team: any; membership: any; orgAdmin: boolean } | NextResponse<ApiResponse<null>>> {
  const user = authed.user;
  const team = await teamDb.getById(teamId);
  if (!team) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Team not found' }, { status: 404 });
  }

  if (!user.organization_id || team.organization_id !== user.organization_id) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const orgAdmin = isOrgAdmin(user);
  const membership = await teamMemberDb.getMembership(teamId, user.id);
  if (!membership && !orgAdmin) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return { team, membership: membership ?? { role: 'viewer' }, orgAdmin };
}

/** Lightweight scope check for read models that do not need hydrated team members. */
export async function requireTeamScopeAccess(
  teamId: string,
  authed: AuthedContext,
): Promise<{ teamId: string; organizationId: string; orgAdmin: boolean } | NextResponse<ApiResponse<null>>> {
  const orgAdmin = isOrgAdmin(authed.user);
  const [teamResult, membershipResult] = await Promise.all([
    supabaseAdmin
      .from('teams')
      .select('id,organization_id')
      .eq('id', teamId)
      .maybeSingle(),
    orgAdmin
      ? Promise.resolve({ data: { team_id: teamId }, error: null })
      : supabaseAdmin
          .from('team_members')
          .select('team_id')
          .eq('team_id', teamId)
          .eq('user_id', authed.user.id)
          .maybeSingle(),
  ]);
  if (teamResult.error) throw teamResult.error;
  if (membershipResult.error) throw membershipResult.error;
  const team = teamResult.data;
  if (!team) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Team not found' }, { status: 404 });
  }
  if (!authed.user.organization_id || team.organization_id !== authed.user.organization_id) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  if (!membershipResult.data && !orgAdmin) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return { teamId, organizationId: String(team.organization_id), orgAdmin };
}

export async function requireTeamAdminOrOrgAdmin(
  teamId: string,
  authed: AuthedContext
): Promise<{ team: any; orgAdmin: boolean } | NextResponse<ApiResponse<null>>> {
  const user = authed.user;
  const team = await teamDb.getById(teamId);
  if (!team) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Team not found' }, { status: 404 });
  }

  if (!user.organization_id || team.organization_id !== user.organization_id) {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const orgAdmin = isOrgAdmin(user);
  if (orgAdmin) return { team, orgAdmin };

  const membership = await teamMemberDb.getMembership(teamId, user.id);
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  return { team, orgAdmin: false };
}

/**
 * Task mutations (create / update / delete / comments) follow team role:
 * - `admin` and `member` may mutate actions in processes they can access.
 * - `viewer` is read-only for actions.
 * - Org `admin` / `owner` bypasses team viewer (operational override).
 */
export function canMutateTeamTasks(
  teamMembership: { role?: string } | null | undefined,
  orgAdmin: boolean
): boolean {
  if (orgAdmin) return true;
  const r = String(teamMembership?.role ?? '')
    .trim()
    .toLowerCase();
  if (r === 'viewer') return false;
  if (r === 'admin' || r === 'member') return true;
  // Align with TaskContext default when role is missing on a membership row (`|| 'member'`).
  if (r === '') return true;
  return false;
}

export function viewerCannotMutateTasksResponse(): NextResponse<ApiResponse<null>> {
  return NextResponse.json<ApiResponse<null>>(
    { success: false, error: 'Read-only: team viewers cannot modify actions' },
    { status: 403 }
  );
}

