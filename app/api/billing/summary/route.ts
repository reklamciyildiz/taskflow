import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { getOrganizationEntitlements, getOrganizationSeatUsage } from '@/lib/entitlements';
import { organizationDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authed = await requireOrgAdmin(request);
    if (authed instanceof NextResponse) return authed;
    const orgId = authed.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const ent = await getOrganizationEntitlements(orgId);
    const seatsUsed = await getOrganizationSeatUsage(orgId);

    const org: any = await organizationDb.getById(orgId);
    const billingProvider = 'creem';
    const subscriptionId = org?.creem_subscription_id ? String(org.creem_subscription_id) : null;

    return NextResponse.json({
      success: true,
      data: {
        plan: ent.plan,
        subscriptionStatus: ent.subscriptionStatus,
        endsAt: ent.endsAt,
        // null signals "unlimited" — Infinity cannot survive JSON serialization
        seatLimit: Number.isFinite(ent.seatLimit) ? ent.seatLimit : null,
        seatsUsed,
        subscriptionId,
        billingProvider,
      },
    });
  } catch (e: any) {
    console.error('billing summary failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

