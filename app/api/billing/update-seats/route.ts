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

    // Step 1: fetch subscription — need item ID and payment method presence
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

    const attrs = subJson?.data?.attributes ?? {};

    // Gate on card presence before attempting a charge — this works in both test and
    // live mode because Lemon populates card_brand/card_last_four as soon as a payment
    // method is saved to the subscription, regardless of mode.
    const hasCard = Boolean(attrs.card_brand && attrs.card_last_four);
    if (!hasCard) {
      return NextResponse.json(
        {
          success: false,
          error: 'No payment method on file. Add a card via the customer portal and try again.',
          code: 'PAYMENT_REQUIRED',
        },
        { status: 402 }
      );
    }

    const itemId =
      attrs.first_subscription_item?.id ??
      attrs.first_subscription_item?.data?.id ??
      null;

    if (!itemId) {
      return NextResponse.json(
        { success: false, error: 'Subscription item not found' },
        { status: 500 }
      );
    }

    // Step 2: charge the prorated difference immediately.
    // Seats are NOT added until this succeeds — no payment, no access.
    const itemResp = await fetch(
      `https://api.lemonsqueezy.com/v1/subscription-items/${encodeURIComponent(String(itemId))}`,
      {
        method: 'PATCH',
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          data: {
            type: 'subscription-items',
            id: String(itemId),
            attributes: { quantity: seats, invoice_immediately: true },
          },
        }),
      }
    );

    const itemJson: any = await itemResp.json().catch(() => null);
    if (!itemResp.ok) {
      const msg = itemJson?.errors?.[0]?.detail || itemJson?.message || 'Seat update failed';
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('billing update-seats failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
