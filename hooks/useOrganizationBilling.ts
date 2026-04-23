'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export type BillingPlan = 'free' | 'pro' | 'team';
export type BillingStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

export function useOrganizationBilling(organizationId: string | null) {
  const [billingPlan, setBillingPlan] = useState<BillingPlan>('free');
  const [billingStatus, setBillingStatus] = useState<BillingStatus>('active');
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<'pro' | 'team' | null>(null);
  const [seatLimit, setSeatLimit] = useState(1);
  const [seatsUsed, setSeatsUsed] = useState(1);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const ensureLemon = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const w = window as Window & { LemonSqueezy?: { Url?: { Open?: (u: string) => void } }; createLemonSqueezy?: () => void };
    if (w.LemonSqueezy?.Url?.Open) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-lemonsqueezy="lemonjs"]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load lemon.js')));
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://app.lemonsqueezy.com/js/lemon.js';
      s.defer = true;
      s.dataset.lemonsqueezy = 'lemonjs';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load lemon.js'));
      document.head.appendChild(s);
    });
    w.createLemonSqueezy?.();
  }, []);

  const refreshBilling = useCallback(async () => {
    if (!organizationId) return;
    setBillingLoading(true);
    try {
      const res = await fetch('/api/billing/summary');
      const json = await res.json();
      if (json?.success && json?.data) {
        const plan = String(json.data.plan ?? 'free').toLowerCase();
        const status = String(json.data.subscriptionStatus ?? 'active').toLowerCase();
        setBillingPlan(plan === 'team' ? 'team' : plan === 'pro' ? 'pro' : 'free');
        setBillingStatus(
          status === 'past_due'
            ? 'past_due'
            : status === 'cancelled'
              ? 'cancelled'
              : status === 'trialing'
                ? 'trialing'
                : 'active'
        );
        setSeatLimit(Number(json.data.seatLimit ?? 1) || 1);
        setSeatsUsed(Number(json.data.seatsUsed ?? 1) || 1);
        const sid = json.data.subscriptionId;
        setSubscriptionId(typeof sid === 'string' && sid ? sid : null);
      }
    } catch {
      // ignore
    } finally {
      setBillingLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  const openCheckout = useCallback(
    async (plan: 'pro' | 'team') => {
      setCheckoutBusy(plan);
      try {
        const resp = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plan === 'team' ? { plan: 'team', seats: 2 } : { plan: 'pro' }),
        });
        const json = await resp.json();
        if (!resp.ok || !json?.success) throw new Error(json?.error || 'Could not start checkout');
        const url = json?.data?.url;
        if (typeof url !== 'string' || !url) throw new Error('Checkout URL missing');

        await ensureLemon();
        const w = window as Window & { LemonSqueezy?: { Url?: { Open?: (u: string) => void } } };
        if (w.LemonSqueezy?.Url?.Open) w.LemonSqueezy.Url.Open(url);
        else window.location.href = url;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not start checkout';
        toast.error(msg);
      } finally {
        setCheckoutBusy(null);
      }
    },
    [ensureLemon]
  );

  const openCustomerPortal = useCallback(async () => {
    try {
      const resp = await fetch('/api/billing/portal');
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error || 'Could not open customer portal');
      const url = json?.data?.customerPortalUrl || json?.data?.updatePaymentMethodUrl;
      if (typeof url !== 'string' || !url) throw new Error('Customer portal URL missing');
      await ensureLemon();
      const w = window as Window & { LemonSqueezy?: { Url?: { Open?: (u: string) => void } } };
      if (w.LemonSqueezy?.Url?.Open) w.LemonSqueezy.Url.Open(url);
      else window.location.href = url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open customer portal';
      toast.error(msg);
    }
  }, [ensureLemon]);

  const openSeatUpgrade = useCallback(async () => {
    try {
      const resp = await fetch('/api/billing/portal');
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error || 'Could not open subscription management');
      const url =
        json?.data?.customerPortalUpdateSubscriptionUrl ||
        json?.data?.customerPortalUrl ||
        json?.data?.updatePaymentMethodUrl;
      if (typeof url !== 'string' || !url) throw new Error('Subscription management URL missing');
      await ensureLemon();
      const w = window as Window & { LemonSqueezy?: { Url?: { Open?: (u: string) => void } } };
      if (w.LemonSqueezy?.Url?.Open) w.LemonSqueezy.Url.Open(url);
      else window.location.href = url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open subscription management';
      toast.error(msg);
    }
  }, [ensureLemon]);

  return {
    billingPlan,
    billingStatus,
    billingLoading,
    checkoutBusy,
    seatLimit,
    seatsUsed,
    subscriptionId,
    refreshBilling,
    openCheckout,
    openCustomerPortal,
    openSeatUpgrade,
  };
}
