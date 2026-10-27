export const RECONCILE_SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_payment_failed',
  'subscription_payment_recovered',
  'subscription_payment_success',
]);

export const REFUND_EVENTS = new Set(['order_refunded']);
