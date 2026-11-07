export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'trialing'
  | 'paused'
  | 'expired';

/** A stale or failed payment must never preserve paid access indefinitely. */
export function isPaidActive(status: SubscriptionStatus, endsAt?: string | null): boolean {
  const parsedEnd = endsAt ? Date.parse(endsAt) : null;
  if (endsAt && (!Number.isFinite(parsedEnd) || (parsedEnd as number) <= Date.now())) return false;
  if (status === 'active' || status === 'trialing') return true;
  // Customer-requested cancellation remains paid until the verified period ends.
  if (status === 'cancelled') return parsedEnd !== null && Number.isFinite(parsedEnd) && parsedEnd > Date.now();
  // Paused, past-due and expired subscriptions must not grant premium access.
  return false;
}


/** Sandbox Creem subscriptions and unknown modes never unlock paid Production features.
 * Manually granted developer plans without provider subscriptions remain unchanged.
 */
export function isCreemSubscriptionEligibleForEnvironment(
  org: { billing_provider?: string | null; creem_subscription_id?: string | null; creem_test_mode?: boolean | null },
  env: { VERCEL_ENV?: string } = process.env,
): boolean {
  if (env.VERCEL_ENV !== 'production') return true;
  if (org.billing_provider !== 'creem' || !org.creem_subscription_id) return true;
  return org.creem_test_mode === false;
}
