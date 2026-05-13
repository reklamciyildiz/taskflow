import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { getOrganizationSeatUsage } from '@/lib/entitlements';

type CheckoutPlan = 'pro' | 'team';
type BillingInterval = 'monthly' | 'yearly';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/** Env: `monthlyId,yearlyId`. Yearly falls back to monthly if only one id is configured. */
function lemonVariantIdForPlan(plan: CheckoutPlan, billingInterval: BillingInterval): string {
  const ids =
    plan === 'pro'
      ? (process.env.LEMON_VARIANT_PRO_IDS ?? '')
      : (process.env.LEMON_VARIANT_TEAM_IDS ?? '');
  const parts = ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) {
    throw new Error(`Missing variant id for plan: ${plan} (set LEMON_VARIANT_${plan.toUpperCase()}_IDS)`);
  }
  if (billingInterval === 'yearly' && parts.length >= 2) return parts[1];
  return parts[0];
}

export async function POST(request: NextRequest) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    const orgId = authed.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const apiKey = requiredEnv('LEMONSQUEEZY_API_KEY');
    const storeId = requiredEnv('LEMONSQUEEZY_STORE_ID');

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

    const variantId = lemonVariantIdForPlan(plan, billingInterval);
    const variantIdNum = Number(variantId);
    if (!Number.isFinite(variantIdNum)) {
      return NextResponse.json({ success: false, error: 'Invalid variant id' }, { status: 500 });
    }

    // Lemon API: custom metadata lives under checkout_data.custom (not custom_data).
    // Per-seat quantity uses checkout_data.variant_quantities — see create-checkout docs.
    const checkoutData: Record<string, unknown> = {
      custom: { organizationId: orgId },
      variant_quantities: [{ variant_id: variantIdNum, quantity: seats }],
    };

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: checkoutData,
          checkout_options: { embed: true },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    };

    const resp = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
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

