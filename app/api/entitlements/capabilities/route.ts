import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { getOrganizationEntitlements } from '@/lib/entitlements';
import { canUsePaidFeature } from '@/lib/paid-feature-policy';

export async function GET(request: NextRequest) {
  const authed = await requireAuthedUser(request);
  if (authed instanceof NextResponse) return authed;
  if (!authed.user.organization_id) return NextResponse.json(
    { success: false, error: 'Organization required' }, { status: 403 });
  try {
    const ent = await getOrganizationEntitlements(authed.user.organization_id);
    return NextResponse.json({
      success: true,
      data: {
        plan: ent.plan,
        advancedReminders: canUsePaidFeature(ent, 'advanced_reminders'),
        googleCalendar: canUsePaidFeature(ent, 'google_calendar'),
        webhooks: canUsePaidFeature(ent, 'webhooks'),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Plan capabilities unavailable' }, { status: 503 });
  }
}
