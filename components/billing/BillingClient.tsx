'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CreditCard,
  ExternalLink,
  Receipt,
  ShieldCheck,
  CheckCircle2,
  Clock3,
  ArrowUpRight,
  RefreshCw,
  Sparkles,
  Users,
  Check,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useOrganizationBilling } from '@/hooks/useOrganizationBilling';
import { isAndroidTwa } from '@/lib/client/is-android-twa';
import { ACTIPROC_PLANS } from '@/lib/billing-plans';

type Props = {
  organizationId: string | null;
  /** When false, render without the top “Back to settings” chrome (e.g. embedded in Settings). */
  showBackLink?: boolean;
};

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'active') return 'default';
  if (status === 'trialing') return 'secondary';
  if (status === 'past_due') return 'destructive';
  if (status === 'cancelled') return 'outline';
  if (status === 'paused') return 'secondary';
  if (status === 'expired') return 'destructive';
  return 'secondary';
}

const PLAN_FEATURES = {
  free: ['2 seats included', '1 team / workspace', '1 process', 'Knowledge Hub (second brain)'],
  individual: ['1 seat', '1 workspace', '3 processes', 'Personal notes and Knowledge Hub'],
  pro: ['Everything in Free', 'Up to 3 teams / workspaces', 'Up to 10 processes', 'Advanced reminders + Google Calendar'],
  team: ['Everything in Pro', 'Unlimited teams / workspaces', 'Unlimited processes', 'Webhooks'],
} as const;

export function BillingClient({ organizationId, showBackLink = true }: Props) {
  const searchParams = useSearchParams();
  const {
    billingPlan,
    billingStatus,
    billingLoading,
    checkoutBusy,
    seatLimit,
    seatsUsed,
    subscriptionId,
    endsAt,
    refreshBilling,
    openCheckout,
    openCustomerPortal,
    switchPlan,
    updateSeats,
    resumeSubscription,
    canResume,
  } = useOrganizationBilling(organizationId);

  const requestedPlan = useMemo(() => {
    const p = (searchParams.get('plan') || '').toLowerCase();
    return p === 'individual' ? 'individual' : p === 'pro' ? 'pro' : p === 'team' ? 'team' : null;
  }, [searchParams]);

  const checkoutSuccess = searchParams.get('checkout') === 'success';

  const [selectedPlan, setSelectedPlan] = useState<'individual' | 'pro' | 'team' | null>(null);
  const [addSeatsOpen, setAddSeatsOpen] = useState(false);
  const [desiredSeats, setDesiredSeats] = useState(1);
  const [addSeatsError, setAddSeatsError] = useState<{ message: string; code?: string } | null>(null);
  const proRef = useRef<HTMLDivElement | null>(null);
  const teamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!requestedPlan) return;
    setSelectedPlan(requestedPlan);
    const el = requestedPlan === 'pro' ? proRef.current : teamRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [requestedPlan]);

  // After checkout return, reconcile after verified Creem webhook delivery.
  useEffect(() => {
    if (!checkoutSuccess) return;
    void refreshBilling();
    const t1 = setTimeout(() => void refreshBilling(), 3000);
    const t2 = setTimeout(() => void refreshBilling(), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAndroid = typeof window !== 'undefined' ? isAndroidTwa() : false;
  const hasPaidSubscription = billingPlan !== 'free' && Boolean(subscriptionId);
  const canUpgrade = billingPlan === 'free' || (billingStatus === 'active' && hasPaidSubscription);
  const planTitle = billingPlan.charAt(0).toUpperCase() + billingPlan.slice(1);
  const formattedEnd = endsAt && Number.isFinite(Date.parse(endsAt))
    ? new Date(endsAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
    : null;
  const busy = checkoutBusy !== null || isAndroid;

  const statusLabel = billingStatus.replace('_', ' ');
  const showSeatMeter =
    (billingPlan === 'team' || billingPlan === 'pro') && Boolean(subscriptionId);
  const seatPct =
    showSeatMeter && seatLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7 pb-12">
      <header className="relative isolate overflow-hidden rounded-[28px] border border-slate-800 bg-[#101c30] px-6 py-7 text-white shadow-[0_22px_60px_-38px_rgba(15,23,42,0.7)] sm:px-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-28 h-72 w-72 rounded-full bg-blue-500/25 blur-[85px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-12 h-64 w-72 rounded-full bg-violet-500/15 blur-[70px]" />
        <div className="relative">
          {showBackLink ? (
            <Link href="/settings" className="mb-5 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to settings
            </Link>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Workspace subscription</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Billing & plans</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">Manage your plan, subscription status and team capacity in one place.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden /> Secured by Creem
            </div>
          </div>
          <div className="mt-7 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
            <div><p className="text-xs text-slate-400">Current plan</p><p className="mt-1 text-xl font-semibold">{planTitle}</p></div>
            <div><p className="text-xs text-slate-400">Subscription</p><p className="mt-1 text-xl font-semibold capitalize">{billingStatus.replace('_',' ')}</p></div>
            <div>
              <p className="text-xs text-slate-400">{billingStatus === 'cancelled' ? 'Access until' : 'Seats in use'}</p>
              <p className="mt-1 text-xl font-semibold">
                {billingStatus === 'cancelled' && formattedEnd ? formattedEnd : seatsUsed + ' / ' + (Number.isFinite(seatLimit) ? seatLimit : '∞')}
              </p>
            </div>
          </div>
        </div>
      </header>

      {isAndroid ? (
        <div className="flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          <Shield className="h-4 w-4 shrink-0 mt-0.5 text-sky-400" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold text-white">Google Play Policy Notice</p>
            <p className="text-xs text-sky-200/90 leading-relaxed">
              Per Google Play terms, subscription upgrades, tier switches, and seat additions are managed directly on our website.
              Please open <span className="font-semibold text-white">actiproc.com</span> in your web browser. Features and seats upgraded on the web immediately apply to this app.
            </p>
          </div>
        </div>
      ) : null}

      {checkoutSuccess && !hasPaidSubscription ? (
        <div role="status" className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
          <Clock3 className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <span>Payment confirmation is pending. Refresh if the plan has not updated yet.</span>
        </div>
      ) : checkoutSuccess && hasPaidSubscription && billingStatus !== 'cancelled' ? (
        <div role="status" className="flex gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
          <span>Your {planTitle} subscription has been verified. Manage your renewal and invoices in the Creem portal.</span>
        </div>
      ) : null}

      {selectedPlan ? (
        <Card className="rounded-2xl border-border/80 bg-card shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">
                Selected plan:{' '}
                <span className="capitalize">{selectedPlan}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Continue to secure checkout when you’re ready.
              </p>

            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                disabled={busy || !canUpgrade || selectedPlan === billingPlan || (billingPlan !== 'free' && ['individual','pro','team'].indexOf(selectedPlan) <= ['individual','pro','team'].indexOf(billingPlan))}
                onClick={() => billingPlan === 'free' ? void openCheckout(selectedPlan, { billingInterval: selectedPlan === 'individual' ? 'yearly' : 'monthly' }) : void switchPlan(selectedPlan, { billingInterval: 'monthly' })}
              >
                Continue to checkout
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setSelectedPlan(null)}>
                Clear selection
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Current subscription */}
      <Card className="overflow-hidden rounded-[24px] border-border/80 bg-card shadow-[0_12px_38px_-28px_rgba(15,23,42,0.45)]">
        <CardHeader className="border-b bg-gradient-to-r from-primary/[0.08] via-muted/30 to-card pb-5 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CreditCard className="h-4 w-4" aria-hidden />
                </span>
                Current subscription
              </CardTitle>
              <CardDescription>
                Organization billing state. Use Refresh after completing checkout or portal changes.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void refreshBilling()}>
                {billingLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || !hasPaidSubscription}
                onClick={() => void openCustomerPortal()}
                title={billingPlan === 'free' ? 'Subscribe first' : 'Invoices & payment method'}
              >
                <Receipt className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Invoices & portal
              </Button>
              {(billingPlan === 'team' || billingPlan === 'pro') && subscriptionId && Number.isFinite(seatLimit) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || billingStatus === 'cancelled'}
                  onClick={() => {
                    setDesiredSeats(seatLimit);
                    setAddSeatsError(null);
                    setAddSeatsOpen(true);
                  }}
                >
                  <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Manage seats
                </Button>
              ) : null}
              {canResume && hasPaidSubscription ? (
                <Button type="button" size="sm" disabled={busy}
                  onClick={() => void resumeSubscription()}>
                  {checkoutBusy === 'resume' ? 'Confirming renewal…' : 'Resume renewal'}
                </Button>
              ) : null}
              {billingPlan === 'free' ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void openCheckout('individual', { billingInterval: 'yearly' })}
                >
                  {busy ? 'Opening…' : 'Upgrade to Individual'}
                </Button>
              ) : billingPlan === 'individual' ? (
                <Button type="button" size="sm" disabled={!canUpgrade || busy} title={!canUpgrade ? 'Plan upgrades are unavailable while the subscription is cancelled or paused' : undefined} onClick={() => void switchPlan('pro', { billingInterval: 'monthly' })}>Upgrade to Pro</Button>
              ) : billingPlan === 'pro' ? (
                // Upgrade the existing Creem subscription, not a second checkout.
                <Button
                  type="button"
                  size="sm"
                  disabled={!canUpgrade || busy}
                  title={!canUpgrade ? 'Plan upgrades are unavailable while the subscription is cancelled or paused' : undefined}
                  onClick={() => void switchPlan('team', { billingInterval: 'monthly' })}
                >
                  {busy ? 'Switching…' : 'Upgrade to Team'}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Plan</span>
            <Badge variant={billingPlan === 'free' ? 'secondary' : 'default'} className="text-xs uppercase">
              {billingPlan}
            </Badge>
            <Separator orientation="vertical" className="hidden h-4 sm:block" />
            <span className="text-sm font-medium text-muted-foreground">Status</span>
            <Badge variant={statusBadgeVariant(billingStatus)} className="capitalize">
              {billingLoading ? '…' : statusLabel}
            </Badge>
          </div>

          {billingStatus === 'past_due' && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Payment failed — action required
                </p>
                <p className="text-xs text-muted-foreground">
                  Your last payment could not be processed. Please update your payment method in the
                  customer portal to avoid losing access.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  onClick={() => void openCustomerPortal()}
                  disabled={busy}
                >
                  <CreditCard className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Update payment method
                </Button>
              </div>
            </div>
          )}

          {billingStatus === 'cancelled' && endsAt ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              Cancellation confirmed. Your premium access continues until{' '}
              <strong>{new Date(endsAt).toLocaleDateString()}</strong>. Automatic renewal is off.
              {canResume ? ' Creem allows you to restore renewal using the action above.' : ' This cancelled subscription cannot be upgraded. You keep your paid benefits through the displayed date.'}
            </div>
          ) : null}

          {billingStatus === 'paused' ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Billing is paused. Paid access is unavailable while paused; manage or resume billing from the customer
              portal.
            </div>
          ) : null}

          {showSeatMeter ? (
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Seat usage</span>
                <span className="tabular-nums text-muted-foreground">
                  {billingLoading ? '…' : `${seatsUsed} / ${Number.isFinite(seatLimit) ? seatLimit : '∞'} used`}
                  {seatPct > 0 && Number.isFinite(seatLimit) ? (
                    <span className="ml-2 text-muted-foreground">({seatPct}%)</span>
                  ) : null}
                </span>
              </div>
              <Progress value={seatsUsed} max={Number.isFinite(seatLimit) ? Math.max(seatLimit, 1) : Math.max(seatsUsed, 1)} className="h-2" />
              {Number.isFinite(seatLimit) && seatsUsed >= seatLimit ? (
                <p className="text-xs text-muted-foreground">
                  Invites are blocked at your purchased seat limit. Use <strong>Add seats</strong> above to increase
                  your quota; changes sync after the next webhook event (use Refresh).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Seat count syncs after Creem webhook events.
                </p>
              )}
            </div>
          ) : null}

          {addSeatsOpen && Number.isFinite(seatLimit) ? (() => {
            const pricePerSeat = (billingPlan === 'team' ? 6 : 4);
            const monthlyTotal = desiredSeats * pricePerSeat;
            const isIncrease = desiredSeats > seatLimit;
            const isDecrease = desiredSeats < seatLimit;
            const isValid = desiredSeats !== seatLimit && desiredSeats >= seatsUsed && desiredSeats >= 1 && desiredSeats <= 500;
            return (
              <div className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Manage seats</p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setAddSeatsOpen(false); setAddSeatsError(null); }}
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Current seats</p>
                    <p className="text-sm font-medium">{seatLimit}</p>
                    <p className="text-xs text-muted-foreground">{seatsUsed} in use · min {seatsUsed}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-seats" className="text-xs text-muted-foreground">
                      New total seats
                    </label>
                    <input
                      id="new-seats"
                      type="number"
                      min={seatsUsed}
                      max={500}
                      value={desiredSeats}
                      onChange={(e) => {
                        const v = Math.floor(Number(e.target.value));
                        setDesiredSeats(Number.isFinite(v) ? Math.max(1, v) : 1);
                        setAddSeatsError(null);
                      }}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <p>
                    Monthly plan: <span className="font-medium text-foreground">{desiredSeats} seats × ${pricePerSeat} = ${monthlyTotal}/mo</span>
                  </p>
                  {isIncrease ? (
                    <p>A prorated charge for the current billing period will be applied immediately.</p>
                  ) : isDecrease ? (
                    <p>Reduction takes effect at your next billing cycle — no refund for the current period.</p>
                  ) : null}
                </div>
                {desiredSeats < seatsUsed ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Cannot go below {seatsUsed} — that is your current active member count. Remove members first.
                  </p>
                ) : null}
                {addSeatsError ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                    <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>{addSeatsError.message}</span>
                    </div>
                    {addSeatsError.code === 'PAYMENT_REQUIRED' ? (
                      <p className="text-xs text-muted-foreground">
                        Add or update your card in the customer portal, then come back and confirm.
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="self-start h-7 border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400 text-xs"
                      onClick={() => void openCustomerPortal()}
                    >
                      <CreditCard className="mr-1.5 h-3 w-3" aria-hidden />
                      {addSeatsError.code === 'PAYMENT_REQUIRED' ? 'Add payment method' : 'Manage billing'}
                    </Button>
                  </div>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !isValid}
                  onClick={async () => {
                    setAddSeatsError(null);
                    try {
                      await updateSeats(desiredSeats);
                      setAddSeatsOpen(false);
                    } catch (e: unknown) {
                      const err = e as Error & { code?: string };
                      setAddSeatsError({ message: err?.message || 'Seat update failed', code: err?.code });
                    }
                  }}
                >
                  {busy
                    ? 'Saving…'
                    : isDecrease
                      ? `Confirm — reduce to ${desiredSeats} seats`
                      : `Confirm — ${desiredSeats} seats`}
                </Button>
              </div>
            );
          })() : null}

          {subscriptionId ? (
            <p className="font-mono text-xs text-muted-foreground">
              Subscription ref: <span className="select-all">{subscriptionId}</span>
            </p>
          ) : billingPlan !== 'free' ? (
            <p className="text-xs text-muted-foreground">Subscription id will appear here after the first webhook sync.</p>
          ) : null}

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              Tax, chargebacks, and receipts are handled by Creem. Open <strong>Invoices & portal</strong> for
              PDF invoices, card updates, and cancellation.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Plan matrix */}
      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Flexible plans</p><h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Choose how your team grows</h2><p className="mt-1 text-sm text-muted-foreground">Individual is annual; Pro and Team are monthly per seat.</p></div>

        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(['free', 'individual', 'pro', 'team'] as const).map((key) => {
            const current = billingPlan === key;
            const title = key === 'free' ? 'Free' : key === 'individual' ? 'Individual' : key === 'pro' ? 'Pro' : 'Team';
            const blurb =
              key === 'free'
                ? 'Get started with core workflows.'
                : key === 'individual'
                  ? 'Personal workflows billed annually.'
                : key === 'pro'
                  ? 'Power features for small teams.'
                  : 'Unlimited workspaces, processes, and webhooks.';

            const requested = selectedPlan === key;
            const ref =
              key === 'pro'
                ? proRef
                : key === 'team'
                  ? teamRef
                  : undefined;

            return (
              <Card
                key={key}
                ref={ref as any}
                className={cn(
                  'relative flex min-h-[345px] flex-col overflow-hidden rounded-[22px] border-border/80 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                  (current || requested) && 'border-primary/40 ring-1 ring-primary/30',
                  key === 'pro' && !current && 'bg-gradient-to-b from-blue-500/[0.07] to-card'
                )}
              >
                {current ? (
                  <div className="absolute right-3 top-3">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      Current
                    </Badge>
                  </div>
                ) : null}
                <CardHeader className="space-y-3 pb-2 pt-6">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    {key === 'pro' ? <Sparkles className="h-4 w-4 text-amber-500" aria-hidden /> : null}
                    {key === 'team' ? <Users className="h-4 w-4 text-primary" aria-hidden /> : null}
                    {title}
                  </CardTitle>
                  <CardDescription className="text-xs">{blurb}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-5 pb-5">
                  <ul className="flex-1 space-y-2 text-xs text-muted-foreground">
                    {PLAN_FEATURES[key].map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {key === 'free' ? (
                    <p className="text-[11px] text-muted-foreground">Default for every organization.</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        <strong className="text-3xl font-semibold tracking-tight text-foreground">${ACTIPROC_PLANS[key].priceUsd}</strong>
                        {key === 'individual' ? '/year' : key === 'team' || key === 'pro' ? '/user/month' : '/month'}
                      </p>
                      <Button type="button" size="sm" variant={current ? 'secondary' : 'default'} className="h-10 w-full rounded-xl"
                        disabled={busy || !canUpgrade || current || (billingPlan !== 'free' && ['individual','pro','team'].indexOf(key) <= ['individual','pro','team'].indexOf(billingPlan))}
                        onClick={() => billingPlan === 'free'
                          ? void openCheckout(key, {billingInterval:key === 'individual' ? 'yearly' : 'monthly'})
                          : void switchPlan(key, {billingInterval:'monthly'})}>
                        {current ? 'Current plan' : !canUpgrade ? billingStatus === 'cancelled' ? 'Not available after cancellation' : 'Unavailable for this subscription' : 'Choose ' + title}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Individual $12/year, Pro $4/seat/month, Team $6/seat/month. Applicable taxes are included; upgrades may incur an immediate prorated charge.
          {billingStatus === 'cancelled' ? ' Pro and Team remain available for new Free organizations. Switching a terminally cancelled organization requires a separate re-subscription process.' : ''}
        </p>
      </div>

      <Card className="rounded-2xl border-border/70 bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Need help?</CardTitle>
          <CardDescription>Billing questions, failed payments, or tax documents — use your payment provider’s portal first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="link" className="h-auto p-0 text-sm" asChild>
            <a href={'https://docs.creem.io'} target="_blank" rel="noopener noreferrer">
              {'Creem help center'}
              <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
