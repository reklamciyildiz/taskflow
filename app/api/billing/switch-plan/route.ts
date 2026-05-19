import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { organizationDb } from '@/lib/db';

type SwitchPlan = 'pro' | 'team';
type BillingInterval = 'monthly' | 'yearly';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function variantIdForPlan(plan: SwitchPlan, billingInterval: BillingInterval): string {
  const ids =
    plan === 'pro'
      ? (process.env.LEMON_VARIANT_PRO_IDS ?? '')
      : (process.env.LEMON_VARIANT_TEAM_IDS ?? '');
  const parts = ids.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error(`Missing variant id for plan: ${plan}`);
  if (billingInterval === 'yearly' && parts.length >= 2) return parts[1];
  return parts[0];
}

/**
 * Switch an existing subscriber between plans (e.g. Pro → Team).
 * Uses Lemon's PATCH /v1/subscriptions/{id} which prorates the charge automatically
 * and fires subscription_updated, keeping a single subscription on record.
 */
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
      return NextResponse.json(
        { success: false, error: 'No active subscription found. Use checkout to subscribe first.' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      plan?: SwitchPlan;
      billingInterval?: BillingInterval;
    };
    const plan: SwitchPlan = body.plan === 'team' ? 'team' : body.plan === 'pro' ? 'pro' : 'team';
    const billingInterval: BillingInterval = body.billingInterval === 'yearly' ? 'yearly' : 'monthly';

    const apiKey = requiredEnv('LEMONSQUEEZY_API_KEY');
    const newVariantId = variantIdForPlan(plan, billingInterval);
    const newVariantIdNum = Number(newVariantId);
    if (!Number.isFinite(newVariantIdNum)) {
      return NextResponse.json({ success: false, error: 'Invalid variant id' }, { status: 500 });
    }

    const resp = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(lsSubscriptionId)}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: 'subscriptions',
          id: String(lsSubscriptionId),
          attributes: { variant_id: newVariantIdNum },
        },
      }),
    });

    const json: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = json?.errors?.[0]?.detail || json?.message || 'Plan switch failed';
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('billing switch-plan failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
