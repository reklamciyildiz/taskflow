import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { organizationDb } from '@/lib/db';
import { getOrganizationSeatUsage } from '@/lib/entitlements';

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

    // Server-side guard: never allow reducing below the current active member count
    const activeMembers = await getOrganizationSeatUsage(orgId);
    if (seats < activeMembers) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot reduce below ${activeMembers} seats — that is the number of active members. Remove members first.`,
        },
        { status: 400 }
      );
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
      const detail = subJson?.errors?.[0]?.detail || subJson?.message;
      console.error('[update-seats] Lemon subscription fetch failed', {
        httpStatus: subResp.status,
        lsSubscriptionId,
        detail,
        body: subJson,
      });
      const hint =
        subResp.status === 401 ? ' (Invalid API key — check LEMONSQUEEZY_API_KEY)' :
        subResp.status === 404 ? ' (Subscription not found — possible test/live mode mismatch)' :
        ` (HTTP ${subResp.status})`;
      const msg = detail ? `${detail}${hint}` : `Could not fetch subscription${hint}`;
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    const attrs = subJson?.data?.attributes ?? {};

    const currentQuantity: number = Number(attrs.first_subscription_item?.quantity ?? attrs.first_subscription_item?.data?.quantity ?? 0);
    const isIncrease = seats > currentQuantity;
    const isDecrease = seats < currentQuantity;

    if (!isIncrease && !isDecrease) {
      // Requested quantity matches what Lemon already has — nothing to do
      return NextResponse.json({ success: true });
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

    if (isIncrease) {
      // For increases: charge the prorated difference immediately.
      // Require a card on file before attempting — avoids vague Lemon error messages.
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

      if (!itemResp.ok) {
        return NextResponse.json(
          {
            success: false,
            error: 'Your payment method could not be charged. Please ensure a valid default card is set in the customer portal and try again.',
            code: 'PAYMENT_REQUIRED',
          },
          { status: 402 }
        );
      }

      return NextResponse.json({ success: true });
    }

    // For decreases: update quantity without an immediate charge.
    // Lemon will bill the reduced amount starting from the next renewal cycle.
    // No refund or credit is issued for the current period (industry standard).
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
            attributes: { quantity: seats },
          },
        }),
      }
    );

    if (!itemResp.ok) {
      const errJson: any = await itemResp.json().catch(() => null);
      const msg = errJson?.errors?.[0]?.detail || errJson?.message || 'Seat update failed';
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    return NextResponse.json({ success: true, reduced: true });
  } catch (e: any) {
    console.error('billing update-seats failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
