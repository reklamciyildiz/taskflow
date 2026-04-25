'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CreditCard,
  ExternalLink,
  Receipt,
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
  return 'secondary';
}

const PLAN_FEATURES = {
  free: ['2 seats included', '1 team / workspace', '2 processes', 'Knowledge Hub (second brain)'],
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
    refreshBilling,
    openCheckout,
    openCustomerPortal,
    openSeatUpgrade,
  } = useOrganizationBilling(organizationId);

  const requestedPlan = useMemo(() => {
    const p = (searchParams.get('plan') || '').toLowerCase();
    return p === 'pro' ? 'pro' : p === 'team' ? 'team' : null;
  }, [searchParams]);

  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'team' | null>(null);
  const proRef = useRef<HTMLDivElement | null>(null);
  const teamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!requestedPlan) return;
    setSelectedPlan(requestedPlan);
    const el = requestedPlan === 'pro' ? proRef.current : teamRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [requestedPlan]);

  const busy = checkoutBusy !== null;
  const statusLabel = billingStatus.replace('_', ' ');
  const seatPct = billingPlan === 'team' && seatLimit > 0 ? Math.round((seatsUsed / seatLimit) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      {showBackLink ? (
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1 text-muted-foreground" asChild>
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to settings
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Billing & plan</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Subscriptions are processed by Lemon Squeezy (merchant of record). Invoices, payment method, and
              cancellations live in the customer portal.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Billing & plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your organization subscription, seats, and Lemon Squeezy customer portal.
          </p>
        </div>
      )}

      {selectedPlan ? (
        <Card className="border-border/80 bg-muted/20">
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
                disabled={busy || (selectedPlan === 'pro' && billingPlan === 'team')}
                onClick={() => void openCheckout(selectedPlan)}
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
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/30 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
                disabled={busy || billingPlan === 'free'}
                onClick={() => void openCustomerPortal()}
                title={billingPlan === 'free' ? 'Subscribe first' : 'Invoices & payment method'}
              >
                <Receipt className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Invoices & portal
              </Button>
              {billingPlan === 'team' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void openSeatUpgrade()}
                >
                  <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Add seats
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void openCheckout(billingPlan === 'free' ? 'pro' : 'team')}
              >
                {busy ? 'Opening…' : billingPlan === 'free' ? 'Upgrade to Pro' : 'Upgrade to Team'}
              </Button>
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

          {billingPlan === 'team' ? (
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Seat usage</span>
                <span className="tabular-nums text-muted-foreground">
                  {billingLoading ? '…' : `${seatsUsed} / ${seatLimit} used`}
                </span>
              </div>
              <Progress value={seatsUsed} max={Math.max(seatLimit, 1)} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Invites are blocked when you reach the seat limit. Add seats from the portal or upgrade quantity at
                renewal.
              </p>
            </div>
          ) : null}

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
              Tax, chargebacks, and receipts are handled by Lemon Squeezy. Open <strong>Invoices & portal</strong> for
              PDF invoices, card updates, and cancellation.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Plan matrix */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Compare plans</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(['free', 'pro', 'team'] as const).map((key) => {
            const current = billingPlan === key;
            const title = key === 'free' ? 'Free' : key === 'pro' ? 'Pro' : 'Team';
            const blurb =
              key === 'free'
                ? 'Get started with core workflows.'
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
                  'relative flex flex-col border-border/80 transition-shadow',
                  (current || requested) && 'ring-2 ring-primary/40 shadow-md'
                )}
              >
                {current ? (
                  <div className="absolute right-3 top-3">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      Current
                    </Badge>
                  </div>
                ) : null}
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {key === 'pro' ? <Sparkles className="h-4 w-4 text-amber-500" aria-hidden /> : null}
                    {key === 'team' ? <Users className="h-4 w-4 text-primary" aria-hidden /> : null}
                    {title}
                  </CardTitle>
                  <CardDescription className="text-xs">{blurb}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
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
                  ) : key === 'pro' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={current ? 'secondary' : 'default'}
                      className="w-full"
                      disabled={busy || current || billingPlan === 'team'}
                      onClick={() => void openCheckout('pro')}
                    >
                      {current ? 'On Pro' : billingPlan === 'team' ? 'Included in Team' : 'Choose Pro'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant={current ? 'secondary' : 'default'}
                      className="w-full"
                      disabled={busy || current}
                      onClick={() => void openCheckout('team')}
                    >
                      {current ? 'On Team' : 'Choose Team'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Prices are shown at checkout (monthly / yearly variants). VAT may apply based on customer location.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Need help?</CardTitle>
          <CardDescription>Billing questions, failed payments, or tax documents — use Lemon’s portal first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="link" className="h-auto p-0 text-sm" asChild>
            <a href="https://docs.lemonsqueezy.com/help" target="_blank" rel="noopener noreferrer">
              Lemon Squeezy help center
              <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
