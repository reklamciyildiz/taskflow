'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export type BillingPlan = 'free' | 'pro' | 'team';
export type BillingStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

type LemonWindow = Window & {
  LemonSqueezy?: {
    Url?: { Open?: (u: string) => void };
    Setup?: (opts: { eventHandler: (event: { event: string; [k: string]: unknown }) => void }) => void;
  };
  createLemonSqueezy?: () => void;
};

export function useOrganizationBilling(organizationId: string | null) {
  const [billingPlan, setBillingPlan] = useState<BillingPlan>('free');
  const [billingStatus, setBillingStatus] = useState<BillingStatus>('active');
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<'pro' | 'team' | null>(null);
  const [seatLimit, setSeatLimit] = useState<number>(Number.POSITIVE_INFINITY);
  const [seatsUsed, setSeatsUsed] = useState(1);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

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
        // null from API = unlimited (Infinity cannot be JSON-serialized)
        setSeatLimit(
          json.data.seatLimit === null
            ? Number.POSITIVE_INFINITY
            : Number(json.data.seatLimit) || 1
        );
        setSeatsUsed(Number(json.data.seatsUsed ?? 1) || 1);
        const sid = json.data.subscriptionId;
        setSubscriptionId(typeof sid === 'string' && sid ? sid : null);
      }
    } catch {
      // ignore — stale state is acceptable
    } finally {
      setBillingLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  // Keep a stable ref so Lemon's eventHandler closure always calls the latest version
  const refreshBillingRef = useRef(refreshBilling);
  useEffect(() => {
    refreshBillingRef.current = refreshBilling;
  }, [refreshBilling]);

  const lemonSetupDone = useRef(false);

  const ensureLemon = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const w = window as LemonWindow;
    if (w.LemonSqueezy?.Url?.Open) {
      // Lemon.js already loaded — just make sure event handler is wired
      if (!lemonSetupDone.current) {
        w.LemonSqueezy?.Setup?.({
          eventHandler: (event) => {
            if (
              event.event === 'Checkout.Success' ||
              event.event === 'PaymentMethodUpdate.Success'
            ) {
              // Two-pass refresh: fast (webhook may already be processed) + slow (safety net)
              setTimeout(() => void refreshBillingRef.current(), 2500);
              setTimeout(() => void refreshBillingRef.current(), 8000);
            }
          },
        });
        lemonSetupDone.current = true;
      }
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-lemonsqueezy="lemonjs"]'
      ) as HTMLScriptElement | null;
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

    // Wire the success event handler once after init
    if (!lemonSetupDone.current) {
      w.LemonSqueezy?.Setup?.({
        eventHandler: (event) => {
          if (
            event.event === 'Checkout.Success' ||
            event.event === 'PaymentMethodUpdate.Success'
          ) {
            setTimeout(() => void refreshBillingRef.current(), 2500);
            setTimeout(() => void refreshBillingRef.current(), 8000);
          }
        },
      });
      lemonSetupDone.current = true;
    }
  }, []);

  const openCheckout = useCallback(
    async (
      plan: 'pro' | 'team',
      opts?: { billingInterval?: 'monthly' | 'yearly'; seats?: number }
    ) => {
      setCheckoutBusy(plan);
      try {
        const billingInterval = opts?.billingInterval === 'yearly' ? 'yearly' : 'monthly';
        const payload: Record<string, unknown> = { plan, billingInterval };
        if (opts?.seats != null && Number.isFinite(opts.seats) && opts.seats >= 1) {
          payload.seats = Math.floor(opts.seats);
        }
        const resp = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await resp.json();
        if (!resp.ok || !json?.success) throw new Error(json?.error || 'Could not start checkout');
        const url = json?.data?.url;
        if (typeof url !== 'string' || !url) throw new Error('Checkout URL missing');

        // Full-page redirect: clean checkout without the app visible behind an overlay.
        // Lemon redirects back to /settings/billing?checkout=success on completion.
        window.location.href = url;
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
      // Open in new tab — portal's own "Back" button navigates within Lemon's domain,
      // so we avoid it overwriting our app's overlay with the Lemon store page.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open customer portal';
      toast.error(msg);
    }
  }, []);

  const updateSeats = useCallback(async (seats: number) => {
    setCheckoutBusy('pro'); // reuse busy flag to disable buttons
    try {
      const resp = await fetch('/api/billing/update-seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error || 'Seat update failed');
      setTimeout(() => void refreshBillingRef.current(), 2500);
      setTimeout(() => void refreshBillingRef.current(), 8000);
      toast.success(
        json?.chargeScheduled
          ? 'Seats updated — prorated charge on your next invoice.'
          : 'Seats updated — syncing…'
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Seat update failed';
      toast.error(msg);
      throw e;
    } finally {
      setCheckoutBusy(null);
    }
  }, []);

  const switchPlan = useCallback(
    async (plan: 'pro' | 'team', opts?: { billingInterval?: 'monthly' | 'yearly' }) => {
      setCheckoutBusy(plan);
      try {
        const billingInterval = opts?.billingInterval === 'yearly' ? 'yearly' : 'monthly';
        const resp = await fetch('/api/billing/switch-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, billingInterval }),
        });
        const json = await resp.json();
        if (!resp.ok || !json?.success) throw new Error(json?.error || 'Plan switch failed');
        // Webhook will update DB; poll twice to catch it
        setTimeout(() => void refreshBillingRef.current(), 2500);
        setTimeout(() => void refreshBillingRef.current(), 8000);
        toast.success('Plan updated — refreshing billing…');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Plan switch failed';
        toast.error(msg);
      } finally {
        setCheckoutBusy(null);
      }
    },
    []
  );

  const openSeatUpgrade = useCallback(async () => {
    try {
      const resp = await fetch('/api/billing/portal');
      const json = await resp.json();
      if (!resp.ok || !json?.success)
        throw new Error(json?.error || 'Could not open subscription management');
      const url =
        json?.data?.customerPortalUpdateSubscriptionUrl ||
        json?.data?.customerPortalUrl ||
        json?.data?.updatePaymentMethodUrl;
      if (typeof url !== 'string' || !url) throw new Error('Subscription management URL missing');
      // Use overlay so Lemon.js can render the prorated cost preview when quantity changes.
      // Plain new-tab mode fetches the proration but can't render the result without the SDK context.
      await ensureLemon();
      const w = window as LemonWindow;
      if (w.LemonSqueezy?.Url?.Open) w.LemonSqueezy.Url.Open(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
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
    switchPlan,
    updateSeats,
  };
}
