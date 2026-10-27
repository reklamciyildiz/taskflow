import { NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { organizationDb } from '@/lib/db';
import { reconcileLemonSubscription } from '@/lib/lemon-subscription';

export async function POST() {
  try {
    const authed = await requireOrgAdmin();
    if (authed instanceof NextResponse) return authed;
    const organizationId = authed.user.organization_id;
    if (!organizationId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const organization: any = await organizationDb.getById(organizationId);
    const subscriptionId = organization?.ls_subscription_id
      ? String(organization.ls_subscription_id)
      : null;
    if (!subscriptionId) {
      return NextResponse.json({ success: true, data: { reconciled: false } });
    }

    const result = await reconcileLemonSubscription({ organizationId, subscriptionId });
    return NextResponse.json({
      success: true,
      data: { reconciled: true, applied: result.applied, status: result.snapshot.status },
    });
  } catch (error) {
    console.error('billing reconciliation failed', error);
    return NextResponse.json({ success: false, error: 'Could not reconcile billing state' }, { status: 502 });
  }
}
