import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { getOrganizationEntitlements, getOrganizationSeatUsage } from '@/lib/entitlements';
import { organizationDb } from '@/lib/db';

export async function GET(_request: NextRequest) {
  try {
    const authed = await requireOrgAdmin();
    if (authed instanceof NextResponse) return authed;
    const orgId = authed.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const ent = await getOrganizationEntitlements(orgId);
    const seatsUsed = await getOrganizationSeatUsage(orgId);

    const org: any = await organizationDb.getById(orgId);
    const subscriptionId = org?.ls_subscription_id ? String(org.ls_subscription_id) : null;

    return NextResponse.json({
      success: true,
      data: {
        plan: ent.plan,
        subscriptionStatus: ent.subscriptionStatus,
        // null signals "unlimited" — Infinity cannot survive JSON serialization
        seatLimit: Number.isFinite(ent.seatLimit) ? ent.seatLimit : null,
        seatsUsed,
        subscriptionId,
      },
    });
  } catch (e: any) {
    console.error('billing summary failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

