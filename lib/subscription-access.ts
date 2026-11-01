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
