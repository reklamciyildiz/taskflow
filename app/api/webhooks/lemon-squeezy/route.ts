import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { lemonWebhookEventDb, organizationDb } from '@/lib/db';
import { getLemonBillingConfig } from '@/lib/lemon-config';
import { RECONCILE_SUBSCRIPTION_EVENTS, REFUND_EVENTS } from '@/lib/lemon-events';
import {
  LemonQuarantineError,
  reconcileLemonSubscription,
} from '@/lib/lemon-subscription';

type LemonWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    id?: string;
    attributes?: Record<string, any>;
  };
};

function verifySignature(rawBody: string, signatureHex: string, secret: string): boolean {
  if (!signatureHex || !/^[a-f0-9]+$/i.test(signatureHex) || signatureHex.length % 2 !== 0) {
    return false;
  }
  const signature = Buffer.from(signatureHex, 'hex');
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return signature.length === digest.length && crypto.timingSafeEqual(signature, digest);
}

function customOrganizationId(payload: LemonWebhookPayload): string | null {
  const custom = payload.meta?.custom_data ?? {};
  const value = custom.organizationId ?? custom.organization_id ?? custom.orgId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function subscriptionIdForEvent(eventName: string, payload: LemonWebhookPayload): string | null {
  const attrs = payload.data?.attributes ?? {};
  if (eventName.startsWith('subscription_') && !eventName.startsWith('subscription_payment_')) {
    return payload.data?.id ? String(payload.data.id) : null;
  }
  const value = attrs.subscription_id ?? attrs.subscriptionId;
  return value == null ? null : String(value);
}

function validateWebhookEnvelope(payload: LemonWebhookPayload, storeId: string, testMode: boolean): void {
  const attrs = payload.data?.attributes ?? {};
  if (attrs.store_id != null && String(attrs.store_id) !== storeId) {
    throw new LemonQuarantineError(`Webhook store mismatch: ${String(attrs.store_id)}`);
  }
  if (attrs.test_mode != null && Boolean(attrs.test_mode) !== testMode) {
    throw new LemonQuarantineError('Webhook test/live mode mismatch');
  }
}

async function resolveOrganizationAndSubscription(
  eventName: string,
  payload: LemonWebhookPayload,
): Promise<{ organizationId: string; subscriptionId: string }> {
  const customOrgId = customOrganizationId(payload);
  let subscriptionId = subscriptionIdForEvent(eventName, payload);

  if (customOrgId) {
    const organization: any = await organizationDb.getById(customOrgId);
    const currentSubscriptionId = organization?.ls_subscription_id
      ? String(organization.ls_subscription_id)
      : null;
    if (
      subscriptionId &&
      currentSubscriptionId &&
      currentSubscriptionId !== subscriptionId &&
      organization?.subscription_status !== 'expired'
    ) {
      throw new LemonQuarantineError('Webhook organization is linked to a different subscription');
    }
    subscriptionId = subscriptionId ?? currentSubscriptionId;
    if (!subscriptionId) {
      throw new LemonQuarantineError('Webhook organization has no subscription to reconcile');
    }
    return { organizationId: customOrgId, subscriptionId };
  }

  if (!subscriptionId) {
    throw new LemonQuarantineError('Webhook does not identify a subscription');
  }
  const organization: any = await organizationDb.getBySubscriptionId(subscriptionId);
  if (!organization?.id) {
    throw new LemonQuarantineError('No organization owns this Lemon subscription');
  }
  return { organizationId: String(organization.id), subscriptionId };
}

export async function POST(request: NextRequest) {
  let payloadHash: string | null = null;
  try {
    const config = getLemonBillingConfig();
    const rawBody = await request.text();
    const signatureHex = request.headers.get('X-Signature') ?? '';
    if (!rawBody || !verifySignature(rawBody, signatureHex, config.webhookSecret)) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody) as LemonWebhookPayload;
    const bodyEventName = String(payload.meta?.event_name ?? '').trim();
    const headerEventName = String(request.headers.get('X-Event-Name') ?? '').trim();
    if (!bodyEventName || (headerEventName && headerEventName !== bodyEventName)) {
      return NextResponse.json({ ok: false, error: 'Invalid event name' }, { status: 400 });
    }

    const supported = RECONCILE_SUBSCRIPTION_EVENTS.has(bodyEventName) || REFUND_EVENTS.has(bodyEventName);
    if (!supported) return NextResponse.json({ ok: true, ignored: true });

    payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const resourceUpdatedAtRaw = payload.data?.attributes?.updated_at;
    const resourceUpdatedAt = resourceUpdatedAtRaw && !Number.isNaN(Date.parse(String(resourceUpdatedAtRaw)))
      ? String(resourceUpdatedAtRaw)
      : null;
    const claim = await lemonWebhookEventDb.claim({
      payload_hash: payloadHash,
      event_name: bodyEventName,
      resource_id: payload.data?.id ? String(payload.data.id) : null,
      resource_updated_at: resourceUpdatedAt,
    });
    if (claim === 'duplicate') return NextResponse.json({ ok: true, duplicate: true });
    if (claim === 'busy') {
      return NextResponse.json({ ok: false, error: 'Event is already processing' }, { status: 503 });
    }

    try {
      validateWebhookEnvelope(payload, config.storeId, config.mode === 'test');
      const target = await resolveOrganizationAndSubscription(bodyEventName, payload);
      const result = await reconcileLemonSubscription({ ...target, config });
      await lemonWebhookEventDb.markCompleted(payloadHash);
      console.info('[lemon-webhook] reconciled authoritative subscription', {
        eventName: bodyEventName,
        organizationId: target.organizationId,
        subscriptionId: target.subscriptionId,
        applied: result.applied,
        status: result.snapshot.status,
      });
      return NextResponse.json({ ok: true, applied: result.applied });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
      if (error instanceof LemonQuarantineError) {
        await lemonWebhookEventDb.markQuarantined(payloadHash, message);
        console.warn('[lemon-webhook] quarantined', { eventName: bodyEventName, reason: message });
        return NextResponse.json({ ok: true, quarantined: true });
      }
      await lemonWebhookEventDb.markFailed(payloadHash, message);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (payloadHash) {
      try {
        await lemonWebhookEventDb.markFailed(payloadHash, message);
      } catch (markError) {
        console.error('[lemon-webhook] could not persist failure state', markError);
      }
    }
    console.error('lemon webhook failed', message);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
