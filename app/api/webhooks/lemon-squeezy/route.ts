import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { lemonWebhookEventDb, organizationDb } from '@/lib/db';

type LemonWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function safePlanFromVariant(variantId: string | null): 'free' | 'pro' | 'team' {
  if (!variantId) return 'free';
  const pro = (process.env.LEMON_VARIANT_PRO_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const team = (process.env.LEMON_VARIANT_TEAM_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (team.includes(variantId)) return 'team';
  if (pro.includes(variantId)) return 'pro';
  return 'free';
}

function safeStatus(input: unknown): 'active' | 'past_due' | 'cancelled' | 'trialing' {
  const s = String(input ?? '').trim().toLowerCase();
  if (s === 'past_due') return 'past_due';
  if (s === 'cancelled' || s === 'expired') return 'cancelled';
  if (s === 'trialing') return 'trialing';
  return 'active';
}

// Events that carry full subscription data (plan, seats, variant)
const SUBSCRIPTION_LIFECYCLE_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_expired',
]);

// Events that only carry payment status change — no plan/seat data
const PAYMENT_STATUS_EVENTS = new Set([
  'subscription_payment_failed',
  'subscription_payment_recovered',
  'subscription_payment_success',
]);

/**
 * Resolve organization ID from webhook payload.
 * Primary: custom_data.organizationId (set during checkout).
 * Fallback for payment events: look up org by ls_subscription_id from attributes.
 */
async function resolveOrganizationId(
  custom: Record<string, unknown>,
  attrs: Record<string, unknown>
): Promise<string | null> {
  const fromCustom =
    (custom.organizationId as string | undefined) ||
    (custom.organization_id as string | undefined) ||
    (custom.orgId as string | undefined) ||
    null;

  if (fromCustom) return fromCustom;

  // Payment event payloads: attributes.subscription_id holds the Lemon subscription ID
  const lsSubId =
    (attrs as any).subscription_id != null
      ? String((attrs as any).subscription_id)
      : null;

  if (!lsSubId) return null;

  const org = await organizationDb.getBySubscriptionId(lsSubId);
  return org?.id ?? null;
}

export async function POST(request: NextRequest) {
  let rawBody = '';
  try {
    const secret = requiredEnv('LEMONSQUEEZY_WEBHOOK_SECRET');

    rawBody = await request.text();
    const signatureHex = request.headers.get('X-Signature') ?? '';
    if (!signatureHex || !rawBody) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook request' }, { status: 400 });
    }

    const signature = Buffer.from(signatureHex, 'hex');
    const digest = Buffer.from(
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
      'hex'
    );
    const sigView = new Uint8Array(signature);
    const digView = new Uint8Array(digest);
    if (
      sigView.length === 0 ||
      sigView.length !== digView.length ||
      !crypto.timingSafeEqual(sigView, digView)
    ) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody) as LemonWebhookPayload;
    const eventName = (
      request.headers.get('X-Event-Name') ??
      payload.meta?.event_name ??
      ''
    ).toString();

    if (!eventName) {
      return NextResponse.json({ ok: false, error: 'Missing event name' }, { status: 400 });
    }

    const isLifecycleEvent = SUBSCRIPTION_LIFECYCLE_EVENTS.has(eventName);
    const isPaymentEvent = PAYMENT_STATUS_EVENTS.has(eventName);

    if (!isLifecycleEvent && !isPaymentEvent) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Idempotency: hash the raw payload to deduplicate Lemon retries
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const firstSeen = await lemonWebhookEventDb.tryMarkSeen(payloadHash, eventName);
    if (!firstSeen) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const custom = payload.meta?.custom_data ?? {};
    const attrs = (payload.data?.attributes ?? {}) as Record<string, unknown>;

    const organizationId = await resolveOrganizationId(custom, attrs);
    if (!organizationId) {
      console.warn('[lemon-webhook] cannot identify organization', { eventName, custom });
      return NextResponse.json(
        { ok: false, error: 'Cannot identify organization' },
        { status: 400 }
      );
    }

    // ─── Payment status events ─────────────────────────────────────────────────
    // Only update subscription_status; never touch plan_name or seat_limit.
    if (isPaymentEvent) {
      const newStatus =
        eventName === 'subscription_payment_failed' ? 'past_due' : 'active';

      await organizationDb.update(organizationId, { subscription_status: newStatus });

      console.info('[lemon-webhook] payment event processed', { eventName, organizationId, newStatus });
      return NextResponse.json({ ok: true });
    }

    // ─── Subscription lifecycle events ────────────────────────────────────────
    const subscriptionId = payload.data?.id ? String(payload.data.id) : null;

    const variantIdRaw = (attrs as any).variant_id ?? (attrs as any).variantId ?? null;
    const variantId = variantIdRaw != null ? String(variantIdRaw) : null;

    const statusRaw = (attrs as any).status ?? (attrs as any).status_formatted ?? null;
    const subscriptionStatus = safeStatus(statusRaw);

    const plan_name = safePlanFromVariant(variantId);

    // ls_customer_id: present in subscription lifecycle payloads
    const customerIdRaw = (attrs as any).customer_id ?? null;
    const ls_customer_id =
      customerIdRaw != null ? String(customerIdRaw) : undefined;

    // Seat limit from Lemon quantity (per-seat products)
    const qtyRaw =
      (attrs as any).quantity ??
      (attrs as any).first_subscription_item?.quantity ??
      (attrs as any).first_subscription_item?.data?.attributes?.quantity ??
      null;
    const qtyNum = Number(qtyRaw);
    const qtyOk = Number.isFinite(qtyNum) && qtyNum >= 1;

    const seat_limit =
      (plan_name === 'team' || plan_name === 'pro') && qtyOk
        ? Math.floor(qtyNum)
        : 1;

    const updates: Record<string, unknown> = {
      ls_subscription_id: subscriptionId,
      variant_id: variantId,
      plan_name,
      subscription_status:
        eventName === 'subscription_cancelled' || eventName === 'subscription_expired'
          ? 'cancelled'
          : subscriptionStatus,
      seat_limit,
    };

    // Only set ls_customer_id when Lemon provides it (don't overwrite with undefined)
    if (ls_customer_id) {
      updates.ls_customer_id = ls_customer_id;
    }

    await organizationDb.update(organizationId, updates);

    console.info('[lemon-webhook] lifecycle event processed', {
      eventName,
      organizationId,
      plan_name,
      seat_limit,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('lemon webhook failed', e?.message ?? e, { rawBodyLen: rawBody?.length ?? 0 });
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
