export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'trialing'
  | 'paused'
  | 'expired';

export function isPaidActive(status: SubscriptionStatus, endsAt?: string | null): boolean {
  // Preserve access during Lemon's retry/dunning window and administrative pauses.
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'paused') {
    return true;
  }
  // Cancellation is end-of-period; Lemon's authoritative ends_at controls access.
  if (status === 'cancelled' && endsAt) return Date.parse(endsAt) > Date.now();
  return false;
}
