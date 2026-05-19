import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { organizationDb } from '@/lib/db';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(request: NextRequest) {
  try {
    const authed = await requireOrgAdmin();
    if (authed instanceof NextResponse) return authed;

    const orgId = authed.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const org: any = await organizationDb.getById(orgId);
    const lsSubscriptionId = org?.ls_subscription_id ? String(org.ls_subscription_id) : null;
    if (!lsSubscriptionId) {
      return NextResponse.json({ success: false, error: 'No active subscription found' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { seats?: number };
    const seats = Math.floor(Number(body.seats));
    if (!Number.isFinite(seats) || seats < 1 || seats > 500) {
      return NextResponse.json({ success: false, error: 'Invalid seat count' }, { status: 400 });
    }

    const apiKey = requiredEnv('LEMONSQUEEZY_API_KEY');

    // Step 1: fetch subscription to get subscription item ID
    const subResp = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(lsSubscriptionId)}`,
      {
        headers: {
          Accept: 'application/vnd.api+json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
    const subJson: any = await subResp.json().catch(() => null);
    if (!subResp.ok) {
      const msg = subJson?.errors?.[0]?.detail || 'Could not fetch subscription';
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    const itemId =
      subJson?.data?.attributes?.first_subscription_item?.id ??
      subJson?.data?.attributes?.first_subscription_item?.data?.id ??
      null;

    if (!itemId) {
      return NextResponse.json(
        { success: false, error: 'Subscription item not found' },
        { status: 500 }
      );
    }

    const itemUrl = `https://api.lemonsqueezy.com/v1/subscription-items/${encodeURIComponent(String(itemId))}`;
    const itemHeaders = {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    };
    const makeBody = (invoiceImmediately: boolean) =>
      JSON.stringify({
        data: {
          type: 'subscription-items',
          id: String(itemId),
          attributes: {
            quantity: seats,
            ...(invoiceImmediately ? { invoice_immediately: true } : {}),
          },
        },
      });

    // Step 2a: try to charge the prorated difference immediately
    let itemResp = await fetch(itemUrl, { method: 'PATCH', headers: itemHeaders, body: makeBody(true) });
    let itemJson: any = await itemResp.json().catch(() => null);

    if (!itemResp.ok) {
      // Step 2b: immediate charge failed (e.g. no/expired payment method, test-mode limitation).
      // Fall back to a quantity-only update — Lemon will bill at the next renewal instead.
      itemResp = await fetch(itemUrl, { method: 'PATCH', headers: itemHeaders, body: makeBody(false) });
      itemJson = await itemResp.json().catch(() => null);

      if (!itemResp.ok) {
        const msg = itemJson?.errors?.[0]?.detail || itemJson?.message || 'Seat update failed';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }

      // Seats updated; prorated amount will be included in the next invoice
      return NextResponse.json({ success: true, chargeScheduled: true });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('billing update-seats failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
