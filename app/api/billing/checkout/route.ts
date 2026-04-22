import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';

type CheckoutPlan = 'pro' | 'team';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function lemonVariantIdForPlan(plan: CheckoutPlan): string {
  const ids =
    plan === 'pro'
      ? (process.env.LEMON_VARIANT_PRO_IDS ?? '')
      : (process.env.LEMON_VARIANT_TEAM_IDS ?? '');
  const first = ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (!first) {
    throw new Error(`Missing variant id for plan: ${plan} (set LEMON_VARIANT_${plan.toUpperCase()}_IDS)`);
  }
  return first;
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

    const body = (await request.json().catch(() => ({}))) as { plan?: CheckoutPlan; seats?: number };
    const plan = body.plan === 'team' ? 'team' : 'pro';
    const seats = plan === 'team' ? Math.max(2, Math.min(500, Number(body.seats ?? 2) || 2)) : 1;

    const variantId = lemonVariantIdForPlan(plan);
    const variantIdNum = Number(variantId);
    if (!Number.isFinite(variantIdNum)) {
      return NextResponse.json({ success: false, error: 'Invalid variant id' }, { status: 500 });
    }

    // Lemon API: custom metadata lives under checkout_data.custom (not custom_data).
    // Per-seat quantity uses checkout_data.variant_quantities — see create-checkout docs.
    const checkoutData: Record<string, unknown> = {
      custom: { organizationId: orgId },
    };
    if (plan === 'team') {
      checkoutData.variant_quantities = [{ variant_id: variantIdNum, quantity: seats }];
    }

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

