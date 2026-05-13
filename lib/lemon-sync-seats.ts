import { organizationDb } from '@/lib/db';
import { getOrganizationEntitlements, getOrganizationSeatUsage, isPaidActive } from '@/lib/entitlements';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * After org membership drops, align Lemon subscription item quantity with current distinct org users.
 * Best-effort only (logs warnings): PayPal-managed subs may not allow API updates per Lemon docs.
 */
export async function syncLemonSubscriptionQuantityToOrgHeadcount(organizationId: string): Promise<void> {
  try {
    if (!organizationId) return;

    const ent = await getOrganizationEntitlements(organizationId);
    if (ent.plan !== 'pro' && ent.plan !== 'team') return;
    if (!isPaidActive(ent.subscriptionStatus)) return;

    const org: any = await organizationDb.getById(organizationId);
    const subId = org?.ls_subscription_id ? String(org.ls_subscription_id) : '';
    if (!subId) return;

    const used = await getOrganizationSeatUsage(organizationId);
    const quantity = Math.max(1, used);

    const apiKey = requiredEnv('LEMONSQUEEZY_API_KEY');
    const subResp = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subId)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const subJson: any = await subResp.json().catch(() => null);
    if (!subResp.ok) {
      console.warn('[lemon-sync-seats] subscription GET failed', subResp.status);
      return;
    }

    const item = subJson?.data?.attributes?.first_subscription_item;
    const itemId =
      item && typeof item === 'object' && item.id != null
        ? String(item.id)
        : subJson?.data?.relationships?.subscription_items?.data?.[0]?.id
          ? String(subJson.data.relationships.subscription_items.data[0].id)
          : null;
    if (!itemId) {
      console.warn('[lemon-sync-seats] missing subscription item id');
      return;
    }

    const patchResp = await fetch(`https://api.lemonsqueezy.com/v1/subscription-items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: 'subscription-items',
          id: itemId,
          attributes: {
            quantity,
            disable_prorations: true,
          },
        },
      }),
    });
    if (!patchResp.ok) {
      const errJson: any = await patchResp.json().catch(() => null);
      console.warn(
        '[lemon-sync-seats] subscription-item PATCH failed',
        patchResp.status,
        errJson?.errors?.[0]?.detail ?? errJson?.message
      );
    }
  } catch (e: any) {
    console.warn('[lemon-sync-seats] unexpected', e?.message ?? e);
  }
}
