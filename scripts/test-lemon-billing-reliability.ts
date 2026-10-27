import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertLemonEnvironmentIsolation,
  getLemonBillingConfig,
  planForVariant,
} from '../lib/lemon-config';
import { REFUND_EVENTS, RECONCILE_SUBSCRIPTION_EVENTS } from '../lib/lemon-events';
import {
  LemonQuarantineError,
  normalizeLemonSubscriptionStatus,
  validateLemonSubscriptionResource,
} from '../lib/lemon-subscription-contract';
import { isPaidActive } from '../lib/subscription-access';

const env = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  LEMONSQUEEZY_MODE: 'live',
  LEMONSQUEEZY_API_KEY: 'test-key-not-used',
  LEMONSQUEEZY_WEBHOOK_SECRET: 'test-secret-not-used',
  LEMONSQUEEZY_STORE_ID: '10',
  LEMON_VARIANT_PRO_IDS: '101,102',
  LEMON_VARIANT_TEAM_IDS: '201,202',
} as NodeJS.ProcessEnv;

const config = getLemonBillingConfig(env);
assert.equal(planForVariant('101', config), 'pro');
assert.equal(planForVariant('202', config), 'team');
assert.equal(planForVariant('999', config), null);
assert.throws(() => assertLemonEnvironmentIsolation('live', { VERCEL_ENV: 'preview' }));
assert.throws(() => assertLemonEnvironmentIsolation('test', { VERCEL_ENV: 'production' }));
assert.doesNotThrow(() => assertLemonEnvironmentIsolation('test', { NODE_ENV: 'development' }));

const baseAttributes = {
  store_id: 10,
  product_id: 50,
  variant_id: 101,
  test_mode: false,
  status: 'active',
  quantity: 3,
  customer_id: 70,
  ends_at: null,
  updated_at: '2026-10-25T12:00:00.000Z',
};
const snapshot = validateLemonSubscriptionResource({
  subscriptionId: '80',
  attributes: baseAttributes,
  variantProductId: 50,
  variantTestMode: false,
  config,
});
assert.equal(snapshot.plan, 'pro');
assert.equal(snapshot.quantity, 3);
assert.equal(normalizeLemonSubscriptionStatus('on_trial'), 'trialing');
assert.equal(normalizeLemonSubscriptionStatus('paused'), 'paused');
assert.equal(normalizeLemonSubscriptionStatus('expired'), 'expired');
assert.throws(() => normalizeLemonSubscriptionStatus('mystery'), LemonQuarantineError);

for (const bad of [
  { attributes: { ...baseAttributes, store_id: 11 } },
  { attributes: { ...baseAttributes, test_mode: true } },
  { attributes: { ...baseAttributes, variant_id: 999 } },
  { attributes: { ...baseAttributes, product_id: 51 } },
  { attributes: { ...baseAttributes, quantity: 0 } },
]) {
  assert.throws(
    () => validateLemonSubscriptionResource({
      subscriptionId: '80',
      attributes: bad.attributes,
      variantProductId: 50,
      variantTestMode: false,
      config,
    }),
    LemonQuarantineError,
  );
}

assert.equal(isPaidActive('cancelled', '2999-01-01T00:00:00.000Z'), true);
assert.equal(isPaidActive('cancelled', '2000-01-01T00:00:00.000Z'), false);
assert.equal(isPaidActive('paused'), true);
assert.equal(isPaidActive('expired'), false);

for (const event of [
  'subscription_created',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_payment_failed',
  'subscription_payment_recovered',
]) {
  assert.equal(RECONCILE_SUBSCRIPTION_EVENTS.has(event), true, `${event} must reconcile`);
}
assert.equal(REFUND_EVENTS.has('order_refunded'), true);

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20261025160000_lemon_webhook_reliability.sql'),
  'utf8',
);
assert.match(migration, /status IN \('processing', 'completed', 'failed', 'quarantined', 'ignored'\)/);
assert.match(migration, /current_row\.status = 'processing'/);
assert.match(migration, /current_row\.processing_started_at > NOW\(\) - INTERVAL '60 seconds'/);
assert.match(migration, /status = 'processing',[\s\S]*attempts = attempts \+ 1/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_ls_subscription_id/);
assert.match(migration, /lemon_subscription_updated_at <= p_resource_updated_at/);
assert.match(migration, /REVOKE ALL ON FUNCTION claim_lemon_webhook_event/);

console.log('Lemon billing reliability contracts passed');
