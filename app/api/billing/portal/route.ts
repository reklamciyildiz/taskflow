import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { organizationDb } from '@/lib/db';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET(_request: NextRequest) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;

    const orgId = authed.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const org: any = await organizationDb.getById(orgId);
    const subId = org?.ls_subscription_id ? String(org.ls_subscription_id) : '';
    if (!subId) {
      return NextResponse.json({ success: false, error: 'No subscription found for this organization' }, { status: 400 });
    }

    const apiKey = requiredEnv('LEMONSQUEEZY_API_KEY');
    const resp = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subId)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const json: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = json?.errors?.[0]?.detail || json?.message || 'Could not load subscription';
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    const urls = json?.data?.attributes?.urls ?? {};
    const customerPortalUrl = urls.customer_portal ?? null;
    const customerPortalUpdateSubscriptionUrl =
      urls.customer_portal_update_subscription ??
      urls.customer_portal_update_subscription_url ??
      urls.customer_portal_update_subscription_url_signed ??
      urls.customer_portal_update_subscription_signed ??
      null;
    const updatePaymentMethodUrl = urls.update_payment_method ?? null;

    if (!customerPortalUrl && !customerPortalUpdateSubscriptionUrl && !updatePaymentMethodUrl) {
      return NextResponse.json({ success: false, error: 'Customer portal URL missing' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        customerPortalUrl,
        customerPortalUpdateSubscriptionUrl,
        updatePaymentMethodUrl,
      },
    });
  } catch (e: any) {
    console.error('billing portal failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

