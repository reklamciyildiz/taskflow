'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export type BillingPlan = 'free' | 'individual' | 'pro' | 'team';
export type BillingStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused' | 'expired';

export function useOrganizationBilling(organizationId: string | null) {
  const [billingPlan, setBillingPlan] = useState<BillingPlan>('free');
  const [billingStatus, setBillingStatus] = useState<BillingStatus>('active');
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<'individual' | 'pro' | 'team' | 'resume' | 'seats' | null>(null);
  const billingProvider = 'creem' as const;
  const [seatLimit, setSeatLimit] = useState<number>(Number.POSITIVE_INFINITY);
  const [seatsUsed, setSeatsUsed] = useState(1);
  const [seatChange, setSeatChange] = useState<{status:string;previousSeats:number;desiredSeats:number}|null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  // Default to no resume action until Creem confirms eligibility for this subscription.
  const [canResume, setCanResume] = useState(false);
  const [canResubscribe, setCanResubscribe] = useState(false);

  const refreshBilling = useCallback(async () => {
    if (!organizationId) return;
    setBillingLoading(true);
    setCanResume(false);
    setCanResubscribe(false);
    try {
      // Reconcile the authoritative subscription before rendering entitlements.
      // A failed reconciliation never grants access; the last verified local state remains visible.
      await fetch('/api/billing/reconcile', { method: 'POST' }).catch(() => null);
      const res = await fetch('/api/billing/summary');
      const json = await res.json();
      if (json?.success && json?.data) {
        const plan = String(json.data.plan ?? 'free').toLowerCase();
        const status = String(json.data.subscriptionStatus ?? 'active').toLowerCase();
        setBillingPlan(plan === 'team' ? 'team' : plan === 'pro' ? 'pro' : plan === 'individual' ? 'individual' : 'free');
        setBillingStatus(
          status === 'past_due'
            ? 'past_due'
            : status === 'cancelled'
              ? 'cancelled'
              : status === 'trialing'
                ? 'trialing'
                : status === 'paused'
                  ? 'paused'
                  : status === 'expired'
                    ? 'expired'
                : 'active'
        );
        // null from API = unlimited (Infinity cannot be JSON-serialized)
        setSeatLimit(
          json.data.seatLimit === null
            ? Number.POSITIVE_INFINITY
            : Number(json.data.seatLimit) || 1
        );
        setSeatsUsed(Number(json.data.seatsUsed ?? 1) || 1);
        setSeatChange(json.data.seatChange && Number.isSafeInteger(json.data.seatChange.desiredSeats)
          ? json.data.seatChange : null);
        const sid = json.data.subscriptionId;
        setSubscriptionId(typeof sid === 'string' && sid ? sid : null);
        const end = json.data.endsAt;
        setEndsAt(typeof end === 'string' && end ? end : null);
        if ((status === 'cancelled' || status === 'paused' || status === 'expired') && typeof sid === 'string' && sid) {
          // Local "cancelled" also represents terminal Creem cancellations.
          // Never show Resume on local status alone.
          const response=await fetch('/api/billing/resume',{cache:'no-store'}).catch(()=>null);
          const result=response?.ok ? await response.json().catch(()=>null) : null;
          setCanResume(result?.success === true && result?.data?.canResume === true);
          setCanResubscribe(result?.success === true && result?.data?.canResubscribe === true);
        }
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

  const refreshBillingRef = useRef(refreshBilling);
  useEffect(() => { refreshBillingRef.current = refreshBilling; }, [refreshBilling]);

  const openCheckout = useCallback(
    async (
      plan: 'individual' | 'pro' | 'team',
      opts?: { billingInterval?: 'monthly' | 'yearly'; seats?: number; resubscribe?: boolean; acceptNewCharge?: boolean }
    ) => {
      setCheckoutBusy(plan);
      try {
        const billingInterval = plan === 'individual' ? 'yearly' : opts?.billingInterval === 'yearly' ? 'yearly' : 'monthly';
        const payload: Record<string, unknown> = { plan, billingInterval };
        if (opts?.resubscribe === true) {
          payload.resubscribe = true;
          payload.acceptNewCharge = opts.acceptNewCharge === true;
        }
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
        // Creem redirects back; access changes only after a verified webhook.
        window.location.href = url;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not start checkout';
        toast.error(msg);
      } finally {
        setCheckoutBusy(null);
      }
    },
    []
  );

  const openCustomerPortal = useCallback(async () => {
    try {
      const resp = await fetch('/api/billing/portal');
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error || 'Could not open customer portal');
      const url = json?.data?.customerPortalUrl || json?.data?.updatePaymentMethodUrl;
      if (typeof url !== 'string' || !url) throw new Error('Customer portal URL missing');
      // Keep Creem's customer portal in its own tab.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open customer portal';
      toast.error(msg);
    }
  }, []);

  const updateSeats = useCallback(async (seats: number) => {
    setCheckoutBusy('seats');
    try {
      const resp = await fetch('/api/billing/update-seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        const err = new Error(json?.error || 'Seat change was not confirmed by Creem.') as Error & { code?: string; traceId?: string };
        if (json?.code) err.code = json.code;
        if (json?.traceId) err.traceId = json.traceId;
        throw err;
      }
      await refreshBillingRef.current();
      setTimeout(() => void refreshBillingRef.current(), 2500);
      setTimeout(() => void refreshBillingRef.current(), 8000);
      toast.message(json?.data?.changed === false
        ? 'The seat quantity is already up to date.'
        : 'Creem accepted the request. Seats will update after billing confirmation.');
    } catch (e: unknown) {
      // The inline seat editor owns error feedback; do not emit a second toast.
      throw e;
    } finally {
      setCheckoutBusy(null);
    }
  }, []);

  const switchPlan = useCallback(
    async (plan: 'individual' | 'pro' | 'team', opts?: { billingInterval?: 'monthly' | 'yearly' }) => {
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

  const resumeSubscription = useCallback(async () => {
    setCheckoutBusy('resume');
    try {
      const response=await fetch('/api/billing/resume',{method:'POST'});
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result?.success)throw new Error(result?.error||'Unable to resume billing');
      await refreshBillingRef.current();
      setTimeout(()=>void refreshBillingRef.current(),2500);
      setTimeout(()=>void refreshBillingRef.current(),8000);
      toast.success(result?.data?.pending
        ? 'Creem is processing the request. Refresh to confirm renewal status.'
        : 'Renewal is active. You can now upgrade your plan.');
    } catch(e:unknown) {
      toast.error(e instanceof Error?e.message:'Unable to resume subscription');
    } finally {
      setCheckoutBusy(null);
    }
  }, []);

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
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open subscription management';
      toast.error(msg);
    }
  }, []);

  return {
    billingPlan,
    billingProvider,
    billingStatus,
    billingLoading,
    checkoutBusy,
    seatLimit,
    seatsUsed,
    seatChange,
    subscriptionId,
    endsAt,
    refreshBilling,
    openCheckout,
    openCustomerPortal,
    openSeatUpgrade,
    switchPlan,
    updateSeats,
    resumeSubscription,
    canResume,
    canResubscribe,
  };
}
