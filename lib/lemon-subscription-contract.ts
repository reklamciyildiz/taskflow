import { planForVariant, type LemonBillingConfig, type LemonPlan } from '@/lib/lemon-config';

export type NormalizedSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'paused'
  | 'expired';

export type LemonSubscriptionSnapshot = {
  subscriptionId: string;
  customerId: string | null;
  storeId: string;
  productId: string;
  variantId: string;
  testMode: boolean;
  status: NormalizedSubscriptionStatus;
  plan: LemonPlan;
  quantity: number;
  endsAt: string | null;
  pauseMode: string | null;
  updatedAt: string;
};

export class LemonQuarantineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LemonQuarantineError';
  }
}

export function requireLemonId(value: unknown, field: string): string {
  const normalized = value == null ? '' : String(value).trim();
  if (!normalized) throw new LemonQuarantineError(`Missing Lemon ${field}`);
  return normalized;
}

export function normalizeLemonSubscriptionStatus(value: unknown): NormalizedSubscriptionStatus {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'active') return 'active';
  if (status === 'on_trial' || status === 'trialing') return 'trialing';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'paused') return 'paused';
  if (status === 'expired') return 'expired';
  throw new LemonQuarantineError(`Unknown Lemon subscription status: ${status || '(empty)'}`);
}

export function validateLemonSubscriptionResource(input: {
  subscriptionId: unknown;
  attributes: Record<string, any>;
  variantProductId: unknown;
  variantTestMode: unknown;
  config: LemonBillingConfig;
}): LemonSubscriptionSnapshot {
  const { attributes, config } = input;
  const subscriptionId = requireLemonId(input.subscriptionId, 'subscription id');
  const storeId = requireLemonId(attributes.store_id, 'store id');
  const productId = requireLemonId(attributes.product_id, 'product id');
  const variantId = requireLemonId(attributes.variant_id, 'variant id');
  const expectedProductId = requireLemonId(input.variantProductId, 'variant product id');
  const expectedTestMode = config.mode === 'test';

  if (storeId !== config.storeId) {
    throw new LemonQuarantineError(`Unexpected Lemon store id: ${storeId}`);
  }
  if (Boolean(attributes.test_mode) !== expectedTestMode) {
    throw new LemonQuarantineError('Lemon subscription test/live mode mismatch');
  }
  if (Boolean(input.variantTestMode) !== expectedTestMode) {
    throw new LemonQuarantineError('Lemon variant test/live mode mismatch');
  }
  const plan = planForVariant(variantId, config);
  if (!plan) throw new LemonQuarantineError(`Unknown Lemon variant id: ${variantId}`);
  if (productId !== expectedProductId) {
    throw new LemonQuarantineError(`Lemon product/variant mismatch for product ${productId}`);
  }

  const quantityRaw =
    attributes.quantity ??
    attributes.first_subscription_item?.quantity ??
    attributes.first_subscription_item?.data?.attributes?.quantity;
  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 500) {
    throw new LemonQuarantineError(`Invalid Lemon subscription quantity: ${quantityRaw}`);
  }

  const updatedAt = String(attributes.updated_at ?? '').trim();
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    throw new LemonQuarantineError('Missing or invalid Lemon subscription updated_at');
  }

  const endsAtRaw = attributes.ends_at;
  const endsAt = endsAtRaw ? String(endsAtRaw) : null;
  if (endsAt && Number.isNaN(Date.parse(endsAt))) {
    throw new LemonQuarantineError('Invalid Lemon subscription ends_at');
  }

  return {
    subscriptionId,
    customerId: attributes.customer_id == null ? null : String(attributes.customer_id),
    storeId,
    productId,
    variantId,
    testMode: expectedTestMode,
    status: normalizeLemonSubscriptionStatus(attributes.status),
    plan,
    quantity: Math.floor(quantity),
    endsAt,
    pauseMode: attributes.pause?.mode ? String(attributes.pause.mode) : null,
    updatedAt,
  };
}
