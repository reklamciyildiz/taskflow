import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { organizationDb, teamDb, customerDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';

/**
 * GET /api/bootstrap — single aggregated payload for the initial app-shell load.
 *
 * Consolidates the read-only, non-team-scoped data that the dashboard used to fetch as
 * several separate requests with a profile → organization waterfall:
 *   - the signed-in user's profile
 *   - their organization
 *   - the teams they belong to
 *   - the organization's customers (with task stats)
 *
 * Team-scoped tasks/projects are intentionally NOT included: the active team is resolved
 * client-side (localStorage) and is fetched separately once known, so folding it in here
 * would just reintroduce a round-trip. This endpoint resolves the session once instead of
 * paying that cost per request, removing the first-paint request burst.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user?.id) {
      // No DB row yet (e.g. mid-onboarding): return an empty-but-successful payload so the
      // client can fall back to session data without treating this as a hard failure.
      return NextResponse.json<ApiResponse<any>>({
        success: true,
        data: { user: null, organization: null, teams: [], customers: [] },
      });
    }

    const organizationId: string | null = user.organization_id ?? null;

    // Fetch the org-scoped pieces in parallel; teams are always user-scoped.
    const [teams, organization, customers] = await Promise.all([
      teamDb.getByUser(user.id).catch(() => []),
      organizationId
        ? organizationDb.getById(organizationId).catch(() => null)
        : Promise.resolve(null),
      organizationId
        ? customerDb
            .getByOrganization(organizationId)
            .then(async (rows: any[]) =>
              Promise.all(
                (rows || []).map(async (c: any) => ({
                  ...c,
                  taskStats: await customerDb.getTaskStats(c.id).catch(() => ({ total: 0, completed: 0 })),
                }))
              )
            )
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: {
        user,
        organization: organization ?? null,
        teams: teams ?? [],
        customers: customers ?? [],
      },
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
