import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse } from '@/lib/types';
import { requireAuthedUser, type AuthedContext } from '@/lib/server-authz';
import { getOrganizationEntitlements } from '@/lib/entitlements';
import { canUsePaidFeature } from '@/lib/paid-feature-policy';

export async function requireGoogleCalendarAccess(request?: NextRequest):
  Promise<AuthedContext | NextResponse<ApiResponse<null>>> {
  const authed = await requireAuthedUser(request);
  if (authed instanceof NextResponse) return authed;
  if (!authed.user.organization_id) return NextResponse.json<ApiResponse<null>>(
    { success: false, error: 'Organization required' }, { status: 403 });
  const ent = await getOrganizationEntitlements(authed.user.organization_id);
  if (!canUsePaidFeature(ent, 'google_calendar')) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Google Calendar requires an active Pro or Team subscription.',
      code: 'PAYWALL_GOOGLE_CALENDAR',
    }, { status: 402 });
  }
  return authed;
}
