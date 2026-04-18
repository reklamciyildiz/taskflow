import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { ApiResponse } from '@/lib/types';
import { teamDb, teamMemberDb, userDb } from '@/lib/db';

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

