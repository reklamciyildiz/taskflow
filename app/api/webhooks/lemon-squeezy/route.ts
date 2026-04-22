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
  if (s === 'cancelled') return 'cancelled';
  if (s === 'trialing') return 'trialing';
  return 'active';
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
    const digest = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), 'hex');
    if (signature.length === 0 || signature.length !== digest.length || !crypto.timingSafeEqual(digest, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody) as LemonWebhookPayload;
    const eventName = (request.headers.get('X-Event-Name') ?? payload.meta?.event_name ?? '').toString();

    if (!eventName) {
      return NextResponse.json({ ok: false, error: 'Missing event name' }, { status: 400 });
    }

    if (!['subscription_created', 'subscription_updated', 'subscription_cancelled'].includes(eventName)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Idempotency: Lemon may retry the same webhook. Since there is no event id header,
    // we store a SHA-256 hash of the raw payload (stable for a given event) and skip duplicates.
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const firstSeen = await lemonWebhookEventDb.tryMarkSeen(payloadHash, eventName);
    if (!firstSeen) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const custom = payload.meta?.custom_data ?? {};
    const organizationId =
      (custom.organizationId as string | undefined) ||
      (custom.organization_id as string | undefined) ||
      (custom.orgId as string | undefined) ||
      null;

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: 'Missing organizationId in custom_data' }, { status: 400 });
    }

    const subscriptionId = payload.data?.id ? String(payload.data.id) : null;
    const attrs = payload.data?.attributes ?? {};

    // Lemon subscription payload is JSON:API; variant id is typically in `variant_id`.
    const variantIdRaw = (attrs as any).variant_id ?? (attrs as any).variantId ?? null;
    const variantId = variantIdRaw != null ? String(variantIdRaw) : null;

    const statusRaw = (attrs as any).status ?? (attrs as any).status_formatted ?? null;
    const subscriptionStatus = safeStatus(statusRaw);

    const plan_name = safePlanFromVariant(variantId);

    // Seat limit: for Team subscriptions, store quantity as seat_limit. Lemon exposes quantity either
    // directly or via first_subscription_item.quantity depending on API version.
    const qtyRaw =
      (attrs as any).quantity ??
      (attrs as any).first_subscription_item?.quantity ??
      (attrs as any).first_subscription_item?.data?.attributes?.quantity ??
      null;
    const seat_limit =
      plan_name === 'team' && Number.isFinite(Number(qtyRaw)) && Number(qtyRaw) >= 2 ? Number(qtyRaw) : 1;

    await organizationDb.update(organizationId, {
      ls_subscription_id: subscriptionId,
      variant_id: variantId,
      plan_name,
      subscription_status: eventName === 'subscription_cancelled' ? 'cancelled' : subscriptionStatus,
      seat_limit,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('lemon webhook failed', e?.message ?? e, { rawBodyLen: rawBody?.length ?? 0 });
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

