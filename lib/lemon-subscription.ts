import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getLemonBillingConfig,
  type LemonBillingConfig,
} from '@/lib/lemon-config';
import {
  LemonQuarantineError,
  requireLemonId,
  validateLemonSubscriptionResource,
  type LemonSubscriptionSnapshot,
} from '@/lib/lemon-subscription-contract';

export { LemonQuarantineError } from '@/lib/lemon-subscription-contract';
export type {
  LemonSubscriptionSnapshot,
  NormalizedSubscriptionStatus,
} from '@/lib/lemon-subscription-contract';

async function lemonGet(path: string, config: LemonBillingConfig): Promise<any> {
  const response = await fetch(`https://api.lemonsqueezy.com/v1/${path}`, {
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    cache: 'no-store',
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || json?.message;
    throw new Error(detail || `Lemon API request failed (${response.status})`);
  }
  return json;
}

export async function fetchValidatedLemonSubscription(
  subscriptionId: string,
  config: LemonBillingConfig = getLemonBillingConfig(),
): Promise<LemonSubscriptionSnapshot> {
  const subscriptionJson = await lemonGet(`subscriptions/${encodeURIComponent(subscriptionId)}`, config);
  const attributes = subscriptionJson?.data?.attributes ?? {};
  const variantId = requireLemonId(attributes.variant_id, 'variant id');
  const variantJson = await lemonGet(`variants/${encodeURIComponent(variantId)}`, config);
  const variantAttributes = variantJson?.data?.attributes ?? {};

  return validateLemonSubscriptionResource({
    subscriptionId: subscriptionJson?.data?.id ?? subscriptionId,
    attributes,
    variantProductId: variantAttributes.product_id,
    variantTestMode: variantAttributes.test_mode,
    config,
  });
}

export async function reconcileLemonSubscription(input: {
  organizationId: string;
  subscriptionId: string;
  config?: LemonBillingConfig;
}): Promise<{ applied: boolean; snapshot: LemonSubscriptionSnapshot }> {
  const config = input.config ?? getLemonBillingConfig();
  const organization: any = await organizationDb.getById(input.organizationId);
  const existingSubscriptionId = organization?.ls_subscription_id
    ? String(organization.ls_subscription_id)
    : null;
  if (
    existingSubscriptionId &&
    existingSubscriptionId !== input.subscriptionId &&
    organization?.subscription_status !== 'expired'
  ) {
    throw new LemonQuarantineError('Organization is already linked to a different Lemon subscription');
  }

  const snapshot = await fetchValidatedLemonSubscription(input.subscriptionId, config);
  const { data, error } = await (supabaseAdmin as any).rpc('apply_lemon_subscription_snapshot', {
    p_organization_id: input.organizationId,
    p_subscription_id: snapshot.subscriptionId,
    p_customer_id: snapshot.customerId,
    p_store_id: snapshot.storeId,
    p_product_id: snapshot.productId,
    p_variant_id: snapshot.variantId,
    p_plan_name: snapshot.plan,
    p_subscription_status: snapshot.status,
    p_seat_limit: snapshot.quantity,
    p_ends_at: snapshot.endsAt,
    p_pause_mode: snapshot.pauseMode,
    p_test_mode: snapshot.testMode,
    p_resource_updated_at: snapshot.updatedAt,
  });
  if (error) throw error;
  return { applied: data === true, snapshot };
}
