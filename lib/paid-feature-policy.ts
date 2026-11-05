import { isPaidActive } from '@/lib/subscription-access';
import type { Entitlements } from '@/lib/entitlements';

export type PaidFeature = 'advanced_reminders' | 'google_calendar' | 'webhooks';
type Relevant = Pick<Entitlements, 'plan' | 'subscriptionStatus' | 'endsAt'>;

/** Authenticated server entitlements only; never use caller-provided plan strings. */
export function canUsePaidFeature(ent: Relevant, feature: PaidFeature): boolean {
  if (!isPaidActive(ent.subscriptionStatus, ent.endsAt)) return false;
  if (feature === 'webhooks') return ent.plan === 'team';
  return ent.plan === 'pro' || ent.plan === 'team';
}

/** Free-tier reminder policy: an explicit reminder at the due time is included. */
export function hasOnlyBasicReminderRules(rules: unknown, dueInstant?: string): boolean {
  if (!Array.isArray(rules)) return false;
  return rules.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const rule = item as Record<string, unknown>;
    if (rule.type === 'preset' && rule.preset === 'when_due') return true;
    // A caller must not label an arbitrary absolute time as "when_due".
    // Compare the actual instant to the canonical schedule due time.
    return rule.type === 'absolute' &&
      typeof rule.at === 'string' && !!dueInstant &&
      Number.isFinite(Date.parse(rule.at)) &&
      Date.parse(rule.at) === Date.parse(dueInstant);
  });
}
