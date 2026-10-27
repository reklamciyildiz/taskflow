import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { getOrganizationSeatUsage } from '@/lib/entitlements';
import { organizationDb } from '@/lib/db';
import { getLemonBillingConfig, variantForPlan } from '@/lib/lemon-config';
import { APP_URL } from '@/lib/site-config';

type CheckoutPlan = 'pro' | 'team';
type BillingInterval = 'monthly' | 'yearly';

export async function POST(request: NextRequest) {
  try {
    const authed = await requireOrgAdmin();
    if (authed instanceof NextResponse) return authed;
    const orgId = authed.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const organization: any = await organizationDb.getById(orgId);
    if (organization?.ls_subscription_id && organization?.subscription_status !== 'expired') {
      return NextResponse.json(
        { success: false, error: 'An existing subscription must be changed from billing settings.' },
        { status: 409 },
      );
    }
    const config = getLemonBillingConfig();

    const body = (await request.json().catch(() => ({}))) as {
      plan?: CheckoutPlan;
      seats?: number;
      billingInterval?: BillingInterval;
    };
    const plan = body.plan === 'team' ? 'team' : 'pro';
    const billingInterval: BillingInterval = body.billingInterval === 'yearly' ? 'yearly' : 'monthly';

    const headcountRaw = await getOrganizationSeatUsage(orgId);
    const headcount = Math.max(1, headcountRaw);
    const reqRaw = body.seats;
    const reqNum = Number(reqRaw);
    const requestedOk = reqRaw !== undefined && reqRaw !== null && Number.isFinite(reqNum) && reqNum >= 1;
    const requestedSeats = requestedOk ? Math.floor(reqNum) : headcount;
    const seats = Math.min(500, Math.max(1, headcount, requestedSeats));

    const variantId = variantForPlan(plan, billingInterval, config);
    const variantIdNum = Number(variantId);
    if (!Number.isFinite(variantIdNum)) {
      return NextResponse.json({ success: false, error: 'Invalid variant id' }, { status: 500 });
    }

    // Lemon API: custom metadata lives under checkout_data.custom (not custom_data).
    // Per-seat quantity uses checkout_data.variant_quantities — see create-checkout docs.
    const checkoutData: Record<string, unknown> = {
      email: authed.user.email ?? undefined,
      custom: { organizationId: orgId },
      variant_quantities: [{ variant_id: variantIdNum, quantity: seats }],
    };

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          // redirect_url lives in product_options, not checkout_options
          product_options: {
            redirect_url: `${APP_URL}/settings/billing?checkout=success`,
          },
          checkout_data: checkoutData,
        },
        relationships: {
          store: { data: { type: 'stores', id: config.storeId } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    };

    const resp = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const json: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = json?.errors?.[0]?.detail || json?.message || 'Checkout creation failed';
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    const url = json?.data?.attributes?.url;
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ success: false, error: 'Checkout URL missing' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { url } });
  } catch (e: any) {
    console.error('billing checkout failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

