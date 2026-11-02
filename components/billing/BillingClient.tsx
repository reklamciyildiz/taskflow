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
  CalendarDays,
  Copy,
  Info,
  Loader2,
  X,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useOrganizationBilling } from '@/hooks/useOrganizationBilling';
import { isCapacitorNative } from '@/lib/client/is-capacitor-native';
import { ACTIPROC_PLANS } from '@/lib/billing-plans';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
type CyclePreview = {
  currentNextChargeAt:string|null; currentPeriodEndAt:string|null;
  billingCyclePolicy:'new-cycle-on-immediate-charge'|'no-immediate-proration';
};
function utcBillingDate(input:string|null):string {
  if(!input || !Number.isFinite(Date.parse(input))) return 'Not available from Creem';
  return new Intl.DateTimeFormat('en-US',{
    dateStyle:'medium',timeStyle:'short',timeZone:'UTC'
  }).format(new Date(input))+' UTC';
}
type BillingReview =
 | (CyclePreview & {kind:'seats';token:string;previousSeats:number;desiredSeats:number;direction:'increase'|'decrease';nextMonthlyUsd:number})
 | (CyclePreview & {kind:'plan';token:string;fromPlan:string;toPlan:'pro'|'team';seats:number;nextMonthlyUsd:number});


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
    billingCycle,
    checkoutBusy,
    seatLimit,
    seatsUsed,
    seatChange,
    planChange,
    subscriptionId,
    endsAt,
    refreshBilling,
    openCheckout,
    openCustomerPortal,
    switchPlan,
    updateSeats,
    previewSeatChange,
    previewPlanUpgrade,
    resumeSubscription,
    canResume,
    canResubscribe,
  } = useOrganizationBilling(organizationId);

  const requestedPlan = useMemo(() => {
    const p = (searchParams.get('plan') || '').toLowerCase();
    return p === 'individual' ? 'individual' : p === 'pro' ? 'pro' : p === 'team' ? 'team' : null;
  }, [searchParams]);

  const checkoutSuccess = searchParams.get('checkout') === 'success';

  const [selectedPlan, setSelectedPlan] = useState<'individual' | 'pro' | 'team' | null>(null);
  const [acceptNewCharge, setAcceptNewCharge] = useState(false);
  const [addSeatsOpen, setAddSeatsOpen] = useState(false);
  const [seatReductionAcknowledged, setSeatReductionAcknowledged] = useState(false);
  const [desiredSeats, setDesiredSeats] = useState(1);
  const [addSeatsError, setAddSeatsError] = useState<{ message: string; code?: string; traceId?: string } | null>(null);
  const [billingReview,setBillingReview] = useState<BillingReview|null>(null);
  const [reviewAcknowledged,setReviewAcknowledged] = useState(false);
  const [reviewBusy,setReviewBusy] = useState(false);
  const [reviewLoading,setReviewLoading] = useState(false);
  const [reviewError,setReviewError] = useState<string|null>(null);
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

  const isNativeApp = typeof window !== 'undefined' ? isCapacitorNative() : false;
  const hasPaidSubscription = billingPlan !== 'free' && Boolean(subscriptionId);
  const canUpgrade = (billingPlan === 'free' || (billingStatus === 'active' && hasPaidSubscription) || canResubscribe) && !seatChange && !planChange;
  const planTitle = billingPlan.charAt(0).toUpperCase() + billingPlan.slice(1);
  const formattedEnd = endsAt && Number.isFinite(Date.parse(endsAt))
    ? new Date(endsAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
    : null;
  const busy = checkoutBusy !== null || isNativeApp || reviewLoading;

  async function requestSeatReview(target:number) {
    setReviewLoading(true);setAddSeatsError(null);
    try {
      const p=await previewSeatChange(target);
      setBillingReview({kind:'seats',token:p.consentToken,previousSeats:p.previousSeats,
        desiredSeats:p.desiredSeats,direction:p.direction,nextMonthlyUsd:p.nextMonthlyUsd,
        currentNextChargeAt:p.currentNextChargeAt,currentPeriodEndAt:p.currentPeriodEndAt,
        billingCyclePolicy:p.billingCyclePolicy});
      setReviewAcknowledged(false);setReviewError(null);
    } catch(e) {
      setAddSeatsError({message:e instanceof Error?e.message:'Unable to review seat change.'});
    } finally {setReviewLoading(false);}
  }
  async function requestPlanReview(plan:'individual'|'pro'|'team') {
    if(plan!=='pro'&&plan!=='team')return;
    setReviewLoading(true);
    try {
      const p=await previewPlanUpgrade(plan);
      setBillingReview({kind:'plan',token:p.consentToken,fromPlan:p.fromPlan,
        toPlan:plan,seats:p.seats,nextMonthlyUsd:p.nextMonthlyUsd,
        currentNextChargeAt:p.currentNextChargeAt,currentPeriodEndAt:p.currentPeriodEndAt,
        billingCyclePolicy:p.billingCyclePolicy});
      setReviewAcknowledged(false);setReviewError(null);
    } catch(e) {
      toast.error(e instanceof Error?e.message:'Unable to review upgrade.');
    } finally {setReviewLoading(false);}
  }
  async function applyReviewedChange(){
    if(!billingReview||!reviewAcknowledged||reviewBusy||busy)return;
    setReviewBusy(true);setReviewError(null);
    try {
      if(billingReview.kind==='seats'){
        await updateSeats(billingReview.desiredSeats,billingReview.token);
        setAddSeatsOpen(false);
      } else {
        await switchPlan(billingReview.toPlan,{billingInterval:'monthly',consentToken:billingReview.token});
      }
      setBillingReview(null);setReviewAcknowledged(false);
    } catch(e) {
      setReviewAcknowledged(false);
      setReviewError((e instanceof Error?e.message:'Payment could not be verified.')+
        ' Refresh billing and request a new review. Do not repeat a charge without checking its status.');
    } finally {setReviewBusy(false);}
  }
  const statusLabel = billingStatus.replace('_', ' ');
  const showSeatMeter =
    (billingPlan === 'team' || billingPlan === 'pro') && Boolean(subscriptionId);
  const seatPct =
    showSeatMeter && seatLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : 0;
  const verifiedPlanRate = seatChange || planChange ? 'Change pending'
    : billingPlan === 'individual' && hasPaidSubscription ? '$12 / year'
    : (billingPlan === 'pro' || billingPlan === 'team') && hasPaidSubscription && Number.isFinite(seatLimit)
      ? '$' + (seatLimit * (billingPlan === 'pro' ? 4 : 6)).toFixed(2) + ' / mo'
      : billingPlan === 'free' ? '$0 / mo' : 'See Creem portal';
  const verifiedNextCharge = billingStatus === 'cancelled'
    ? 'Renewal off'
    : billingCycle?.nextChargeVerified
      ? utcBillingDate(billingCycle.nextChargeAt)
      : hasPaidSubscription ? 'Check Creem portal' : 'No payment scheduled';
  const actionSecondary = 'h-10 rounded-xl border-border/80 bg-background px-3.5 text-xs font-medium shadow-sm transition-all hover:-translate-y-px hover:border-primary/30 hover:bg-primary/[0.045] hover:shadow-md focus-visible:ring-primary/40';
  const actionPrimary = 'h-10 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-[0_10px_20px_-12px_rgba(37,99,235,0.8)] transition-all hover:-translate-y-px hover:bg-blue-700 hover:shadow-lg focus-visible:ring-blue-500';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7 pb-12">

      <Dialog open={Boolean(billingReview)} onOpenChange={open=>{if(!open&&!reviewBusy){setBillingReview(null);setReviewError(null);setReviewAcknowledged(false);}}}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[540px] gap-0 overflow-y-auto rounded-[26px] border border-border/60 bg-background p-0 shadow-[0_35px_100px_-30px_rgba(15,23,42,0.55)] sm:rounded-[30px]" hideClose>
          <div className="relative isolate overflow-hidden bg-[#101e36] px-5 py-6 text-white sm:px-7 sm:py-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-56 w-56 rounded-full bg-sky-500/25 blur-[65px]" />
            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-24 h-24 w-32 rounded-full bg-indigo-500/15 blur-[50px]" />
            <button type="button" aria-label="Close billing review" disabled={reviewBusy}
              onClick={()=>{setBillingReview(null);setReviewError(null);setReviewAcknowledged(false);}}
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-slate-200 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-40">
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="relative flex items-start gap-3 pr-9">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                <ShieldCheck className="h-5 w-5 text-sky-200" aria-hidden />
              </span>
              <DialogHeader className="space-y-1.5 text-left">
                <div className="text-[10px] font-semibold uppercase tracking-[0.19em] text-sky-300">Secure billing confirmation</div>
                <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Review billing change</DialogTitle>
                <DialogDescription className="text-xs leading-relaxed text-slate-300">
                  Nothing is charged or changed until you authorize this request.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          {billingReview ? <div className="space-y-4 p-5 sm:p-6">
            <section aria-label="Your updated subscription" className="overflow-hidden rounded-[20px] border border-border/70 bg-card shadow-[0_8px_28px_-24px_rgba(15,23,42,0.4)]">
              <div className="space-y-3 px-4 py-4 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">Subscription update</p>
                {billingReview.kind==='seats' ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-center">
                      <div className="text-[11px] text-muted-foreground">Current seats</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">{billingReview.previousSeats}</div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 text-center">
                      <div className="text-[11px] text-muted-foreground">New seats</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums text-primary">{billingReview.desiredSeats}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
                      <div className="text-[11px] text-muted-foreground">Current plan</div>
                      <div className="mt-1 text-base font-semibold capitalize">{billingReview.fromPlan}</div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
                      <div className="text-[11px] text-muted-foreground">New plan · {billingReview.seats} seats</div>
                      <div className="mt-1 text-base font-semibold capitalize text-primary">{billingReview.toPlan}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-border/70 bg-muted/25 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">New monthly list price</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Future monthly rate · not today&apos;s charge</p>
                  </div>
                  <div className="text-right text-2xl font-semibold tracking-tight tabular-nums">
                    ${billingReview.nextMonthlyUsd.toFixed(2)}<span className="ml-1 text-xs font-medium text-muted-foreground">/ month</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> Current renewal date</span>
                  <span className="font-medium tabular-nums">{utcBillingDate(billingReview.currentNextChargeAt)}</span>
                </div>
              </div>
            </section>
            {billingReview.kind==='seats' && billingReview.direction==='decrease' ? (
              <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <div className="space-y-1.5 text-xs leading-relaxed">
                  <p className="font-semibold text-foreground">Seat reduction</p>
                  <p className="text-muted-foreground">Creem may apply fewer seats immediately or at the next billing cycle. Unused prepaid time is not automatically refunded. Confirm the effective quantity after synchronization.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div className="space-y-1.5 text-xs leading-relaxed">
                    <p className="font-semibold text-foreground">Today&apos;s charge is prorated</p>
                    <p className="text-muted-foreground">Creem calculates the immediate charge using your subscription&apos;s remaining prepaid time and the new price. It may be lower than the full monthly difference, but the amount is not guaranteed.</p>
                    <p className="font-medium text-foreground">The exact charge is set by Creem and is not available before confirmation in this integration.</p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="space-y-1.5 text-xs leading-relaxed">
                    <p className="font-semibold text-foreground">Your renewal date will change</p>
                    <p className="text-muted-foreground">The immediate-charge option starts a new billing cycle. We&apos;ll show the new date only after Creem verifies the update.</p>
                  </div>
                </div>
              </div>
            )}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/80 bg-card p-4 text-xs leading-relaxed transition-colors hover:border-primary/35">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600 focus-visible:ring-2 focus-visible:ring-primary"
                checked={reviewAcknowledged} disabled={reviewBusy||Boolean(reviewError)} onChange={e=>setReviewAcknowledged(e.target.checked)} />
              <span className="text-foreground/90">{billingReview.kind==='seats'&&billingReview.direction==='decrease'
                ? 'I approve reducing my seats, understand the effective date may vary, and do not expect an automatic refund.'
                : 'I authorize the Creem-calculated immediate charge to my saved card, understand it may be prorated, and accept the new monthly rate and billing-cycle reset.'}</span>
            </label>
            {reviewError?<div role="alert" className="flex gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{reviewError}</div>:null}
            <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={reviewBusy}
                className="h-11 rounded-xl px-5 transition-all hover:bg-muted"
                onClick={()=>{setBillingReview(null);setReviewAcknowledged(false);setReviewError(null);}}>Cancel</Button>
              <Button type="button" disabled={!reviewAcknowledged||reviewBusy||Boolean(reviewError)||busy}
                className="h-11 rounded-xl bg-blue-600 px-5 font-semibold text-white shadow-[0_10px_24px_-12px_rgba(37,99,235,0.8)] transition-all hover:bg-blue-700 focus-visible:ring-blue-500"
                onClick={()=>void applyReviewedChange()}>
                {reviewBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Confirming with Creem…</> :
                  billingReview.kind==='seats'&&billingReview.direction==='decrease' ? <><Check className="mr-2 h-4 w-4" aria-hidden />Confirm reduction</> :
                  <><ShieldCheck className="mr-2 h-4 w-4" aria-hidden />Authorize charge &amp; confirm</>}
              </Button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Payment processing and receipts are handled by Creem.
            </div>
          </div>:null}
        </DialogContent>
      </Dialog>

      <header className="relative isolate overflow-hidden rounded-[28px] border border-[#263c5c] bg-[#101c30] px-5 py-6 text-white shadow-[0_24px_70px_-43px_rgba(15,23,42,0.7)] sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-sky-500/20 blur-[90px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 left-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-[70px]" />
        <div className="relative">
          {showBackLink ? (
            <Link href="/settings" className="mb-6 inline-flex items-center gap-1.5 rounded-lg text-xs text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to settings
            </Link>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden /> Workspace subscription
              </div>
              <h1 className="mt-2.5 text-[26px] font-semibold tracking-tight sm:text-[32px]">Billing &amp; plans</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">One clear view of your subscription, seats, and upcoming billing dates.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] font-medium text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Secured by Creem
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-medium capitalize text-white">
                <span className={cn('h-1.5 w-1.5 rounded-full', billingStatus==='active'?'bg-emerald-400':billingStatus==='past_due'?'bg-amber-400':'bg-slate-300')} aria-hidden />
                {statusLabel}
              </span>
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-5 lg:grid-cols-4">
            <div className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300"><CreditCard className="h-3.5 w-3.5 text-sky-300" aria-hidden /> Current plan</div>
              <p className="mt-2 truncate text-xl font-semibold tracking-tight">{planTitle}</p>
            </div>
            <div className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300"><Users className="h-3.5 w-3.5 text-sky-300" aria-hidden /> Seat capacity</div>
              <p className="mt-2 truncate text-xl font-semibold tracking-tight tabular-nums">{seatsUsed}<span className="px-1 text-slate-500">/</span>{Number.isFinite(seatLimit)?seatLimit:'∞'}</p>
            </div>
            <div className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300"><Receipt className="h-3.5 w-3.5 text-sky-300" aria-hidden /> Verified list price</div>
              <p className="mt-2 truncate text-lg font-semibold tracking-tight tabular-nums" title={verifiedPlanRate}>{verifiedPlanRate}</p>
            </div>
            <div className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300"><CalendarDays className="h-3.5 w-3.5 text-sky-300" aria-hidden /> Next scheduled charge</div>
              <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug" title={verifiedNextCharge}>{verifiedNextCharge}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">List prices exclude individual discounts or credits. The next-charge date is displayed only when confirmed by Creem.</p>
        </div>
      </header>

      {hasPaidSubscription ? (
        <section aria-label="Billing cycle details" className="grid gap-3 rounded-[22px] border border-border/70 bg-card p-4 shadow-sm sm:grid-cols-[1fr_1fr_1.5fr] sm:items-center sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><CalendarDays className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">Current period ends</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{utcBillingDate(billingCycle?.currentPeriodEndAt??null)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><ShieldCheck className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">Payment provider</p>
              <p className="mt-1 text-sm font-semibold">Creem</p>
              <p className="text-[11px] text-muted-foreground">Invoices and card management in portal</p>
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Immediate charged changes start a new billing cycle. Refresh to view the next verified charge date after a change.
          </p>
        </section>
      ) : null}

      {isNativeApp ? (
        <div className="flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          <Shield className="h-4 w-4 shrink-0 mt-0.5 text-sky-400" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold text-white">Google Play Policy Notice</p>
            <p className="text-xs text-sky-200/90 leading-relaxed">
              This Capacitor app displays your existing subscription. Purchasing, upgrading and changing paid seats are unavailable in the native application.
              Your account's existing paid entitlements are synchronized across devices.
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

      {canResubscribe ? (
        <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.08] p-4 text-sm">
          <p className="font-semibold">Start a new subscription</p>
          <p className="text-muted-foreground">
            Your previous Creem subscription was permanently cancelled. A new purchase starts
            a separate paid subscription immediately. Any unused time on the previous term
            is <strong>not automatically credited or refunded</strong>.
          </p>
          <label className="flex cursor-pointer items-start gap-3 font-medium">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600"
              checked={acceptNewCharge} onChange={(event) => setAcceptNewCharge(event.target.checked)} />
            <span>I understand that a new charge will be made now, even if I have paid access remaining.</span>
          </label>
        </div>
      ) : null}

      {selectedPlan ? (
        <Card className="rounded-[20px] border-primary/25 bg-gradient-to-r from-primary/[0.065] to-card shadow-sm">
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
                className={actionPrimary}
                disabled={busy || !canUpgrade || (canResubscribe && !acceptNewCharge) ||
                  (!canResubscribe && (selectedPlan === billingPlan || (billingPlan !== 'free' && ['individual','pro','team'].indexOf(selectedPlan) <= ['individual','pro','team'].indexOf(billingPlan))))}
                onClick={() => canResubscribe
                  ? void openCheckout(selectedPlan, { billingInterval: selectedPlan === 'individual' ? 'yearly' : 'monthly', resubscribe: true, acceptNewCharge })
                  : billingPlan === 'free'
                    ? void openCheckout(selectedPlan, { billingInterval: selectedPlan === 'individual' ? 'yearly' : 'monthly' })
                    : void requestPlanReview(selectedPlan)}
              >
                Continue to checkout
              </Button>
              <Button type="button" variant="outline" className={actionSecondary} disabled={busy} onClick={() => setSelectedPlan(null)}>
                Clear selection
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Current subscription */}
      <Card className="overflow-hidden rounded-[26px] border-border/70 bg-card shadow-[0_15px_48px_-32px_rgba(15,23,42,0.48)]">
        <CardHeader className="border-b border-border/70 bg-gradient-to-br from-primary/[0.075] via-card to-card pb-5 pt-6 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_22px_-11px_rgba(37,99,235,0.8)]">
                  <CreditCard className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Subscription management</p>
                  <CardTitle className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">Current subscription</CardTitle>
                </div>
              </div>
              <CardDescription className="max-w-lg text-xs leading-relaxed">
                Your verified subscription details and available account actions.
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button type="button" variant="outline" size="sm" className={actionSecondary} disabled={busy} onClick={() => void refreshBilling()}>
                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', billingLoading && 'animate-spin')} aria-hidden />
                {billingLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={actionSecondary}
                disabled={busy || !hasPaidSubscription}
                onClick={() => void openCustomerPortal()}
                title={billingPlan === 'free' ? 'Subscribe first' : 'Invoices & payment method'}
              >
                <Receipt className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Invoices &amp; portal
              </Button>
              {(billingPlan === 'team' || billingPlan === 'pro') && subscriptionId && Number.isFinite(seatLimit) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={actionSecondary}
                  disabled={busy || billingStatus !== 'active' || Boolean(seatChange) || Boolean(planChange)}
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
                <Button type="button" size="sm" className={actionPrimary} disabled={busy}
                  onClick={() => void resumeSubscription()}>
                  {checkoutBusy === 'resume' ? 'Confirming renewal…' : 'Resume renewal'}
                </Button>
              ) : null}
              {billingPlan === 'free' ? (
                <Button
                  type="button"
                  size="sm"
                  className={actionPrimary}
                  disabled={busy}
                  onClick={() => void openCheckout('individual', { billingInterval: 'yearly' })}
                >
                  {busy ? 'Opening…' : 'Upgrade to Individual'}
                </Button>
              ) : billingPlan === 'individual' && !canResubscribe ? (
                <Button type="button" size="sm" className={actionPrimary} disabled={!canUpgrade || busy} title={!canUpgrade ? 'Plan upgrades are unavailable while the subscription is cancelled or paused' : undefined} onClick={() => void requestPlanReview('pro')}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Upgrade to Pro
                </Button>
              ) : billingPlan === 'pro' && !canResubscribe ? (
                // Upgrade the existing Creem subscription, not a second checkout.
                <Button
                  type="button"
                  size="sm"
                  className={actionPrimary}
                  disabled={!canUpgrade || busy}
                  title={!canUpgrade ? 'Plan upgrades are unavailable while the subscription is cancelled or paused' : undefined}
                  onClick={() => void requestPlanReview('team')}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {busy ? 'Switching…' : 'Upgrade to Team'}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6 sm:px-7 sm:pb-7">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-medium text-muted-foreground">Your plan</span>
            <Badge variant={billingPlan === 'free' ? 'secondary' : 'default'} className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide">
              {billingPlan}
            </Badge>
            <Separator orientation="vertical" className="mx-1 hidden h-4 sm:block" />
            <span className="text-xs font-medium text-muted-foreground">Subscription status</span>
            <Badge variant={statusBadgeVariant(billingStatus)} className="rounded-full px-3 py-1 text-[10px] font-semibold capitalize">
              {billingLoading ? 'Refreshing…' : statusLabel}
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
              {canResume ? ' Creem allows you to restore renewal using the action above.' : canResubscribe ? ' You can start a separate new subscription below after acknowledging the new charge.' : ' You keep your paid benefits through the displayed date.'}
            </div>
          ) : null}

          {billingStatus === 'paused' ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Billing is paused. Paid access is unavailable while paused; manage or resume billing from the customer
              portal.
            </div>
          ) : null}

          {planChange ? (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-xs leading-relaxed text-foreground">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div><p className="mb-1 font-semibold">Plan upgrade pending verification</p>
                Your upgrade from <strong className="capitalize">{planChange.previousPlan}</strong> to <strong className="capitalize">{planChange.desiredPlan}</strong> is awaiting a verified Creem payment. You cannot start another change while verification is pending. Refresh your status or contact support if review remains open.
              </div>
            </div>
          ) : null}
          {seatChange ? (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-xs leading-relaxed text-foreground">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div><p className="mb-1 font-semibold">Seat change pending verification</p>
                Creem is verifying your request for <strong>{seatChange.desiredSeats}</strong> seats.
                {seatChange.status === 'review' ? ' This requires billing review before another change.' : ' A new charge cannot start until confirmation.'} Refresh to check its status.
              </div>
            </div>
          ) : null}
          {showSeatMeter ? (
            <div className="space-y-4 rounded-[20px] border border-border/70 bg-gradient-to-br from-muted/45 via-card to-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.08] text-primary"><Users className="h-4 w-4" aria-hidden /></span> Team seat usage</span>
                <span className="tabular-nums text-muted-foreground">
                  {billingLoading ? '…' : `${seatsUsed} / ${Number.isFinite(seatLimit) ? seatLimit : '∞'} used`}
                  {seatPct > 0 && Number.isFinite(seatLimit) ? (
                    <span className="ml-2 text-muted-foreground">({seatPct}%)</span>
                  ) : null}
                </span>
              </div>
              <Progress aria-label="Seats used" value={seatsUsed} max={Number.isFinite(seatLimit) ? Math.max(seatLimit, 1) : Math.max(seatsUsed, 1)} className="h-2.5 overflow-hidden rounded-full bg-primary/10" />
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
            const isValid = Number.isSafeInteger(desiredSeats) && desiredSeats !== seatLimit && desiredSeats >= seatsUsed && desiredSeats >= 1 && desiredSeats <= 500 && (!isDecrease || seatReductionAcknowledged);
            return (
              <div className="space-y-5 rounded-[22px] border border-primary/25 bg-gradient-to-br from-primary/[0.04] via-card to-card p-5 shadow-[0_14px_36px_-26px_rgba(15,23,42,0.4)] sm:p-6">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold tracking-tight">Manage seats</p><p className="mt-1 text-xs text-muted-foreground">Review your new capacity before confirming.</p></div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setAddSeatsOpen(false); setAddSeatsError(null); }}
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-background/75 px-4 py-3">
                     <p className="text-xs text-muted-foreground">Current capacity</p>
                     <p className="mt-1 text-2xl font-semibold tabular-nums">{seatLimit}<span className="ml-1 text-xs font-medium text-muted-foreground">seats</span></p>
                     <p className="mt-1 text-xs text-muted-foreground">{seatsUsed} in use · minimum {seatsUsed}</p>
                   </div>
                  <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/[0.035] px-4 py-3">
                     <label htmlFor="new-seats" className="text-xs font-medium text-foreground">
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
                        setSeatReductionAcknowledged(false);
                      }}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-base font-semibold tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 bg-background/75 px-4 py-3 text-xs text-muted-foreground">
                  <p>
                    New monthly list price: <span className="font-semibold text-foreground">{desiredSeats} seats × ${pricePerSeat} = ${monthlyTotal}/mo</span>
                  </p>
                  {isIncrease ? (
                    <p>Creem calculates today&apos;s prorated payment using remaining prepaid time and the new price. The exact charge is not available before confirmation, and the immediate charge resets the billing cycle.</p>
                  ) : isDecrease ? (
                    <p>Creem can reduce seat quantity immediately without automatically refunding prepaid time. Review this before confirming.</p>
                  ) : null}
                </div>
                {isDecrease ? (
                  <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0"
                      checked={seatReductionAcknowledged}
                      onChange={event => setSeatReductionAcknowledged(event.target.checked)} />
                    <span>I understand that reducing seats may apply immediately and does not automatically refund unused subscription time.</span>
                  </label>
                ) : null}
                {desiredSeats < seatsUsed ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Cannot go below {seatsUsed} — that is your current active member count. Remove members first.
                  </p>
                ) : null}
                {addSeatsError ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                    <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>{addSeatsError.message}{addSeatsError.traceId ? ' (Creem reference: '+addSeatsError.traceId+')' : ''}</span>
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
                      {addSeatsError.code === 'PAYMENT_REQUIRED' ? 'Add payment method' : 'Review in Creem'}
                    </Button>
                  </div>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white shadow-[0_12px_26px_-16px_rgba(37,99,235,0.85)] transition-all hover:bg-blue-700"
                   disabled={busy || Boolean(seatChange) || Boolean(planChange) || !isValid}
                  onClick={async () => {
                    setAddSeatsError(null);
                    try {
                      await requestSeatReview(desiredSeats);
                    } catch (e: unknown) {
                      const err = e as Error & { code?: string };
                      setAddSeatsError({ message: err?.message || 'Seat update failed', code: err?.code, traceId:(err as Error & {traceId?:string})?.traceId });
                    }
                  }}
                >
                  {busy
                    ? 'Saving…'
                    : isDecrease
                      ? `Review reduction to ${desiredSeats} seats`
                      : `Review payment for ${desiredSeats} seats`}
                </Button>
              </div>
            );
          })() : null}

          {subscriptionId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">Subscription reference</p>
                <p className="mt-1 break-all font-mono text-[11px] text-foreground/80" title={subscriptionId}>{subscriptionId}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 rounded-lg px-3 text-xs"
                aria-label="Copy subscription reference" onClick={async()=>{
                  try { await navigator.clipboard.writeText(subscriptionId); toast.success('Subscription reference copied'); }
                  catch { toast.error('Unable to copy subscription reference'); }
                }}>
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copy
              </Button>
            </div>
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
                  'group relative flex min-h-[365px] flex-col overflow-hidden rounded-[24px] border-border/70 bg-card shadow-[0_14px_36px_-27px_rgba(15,23,42,0.4)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_20px_46px_-26px_rgba(15,23,42,0.35)]',
                  (current || requested) && 'border-primary/45 ring-1 ring-primary/20',
                  key === 'pro' && !current && 'bg-gradient-to-b from-blue-500/[0.07] via-card to-card',
                  key === 'team' && !current && 'bg-gradient-to-b from-indigo-500/[0.055] via-card to-card'
                )}
              >
                {current ? (
                  <div className="absolute right-3 top-3">
                    <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/[0.055] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Current
                    </Badge>
                  </div>
                ) : null}
                <CardHeader className="space-y-3 pb-3 pt-7">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                    {key === 'pro' ? <Sparkles className="h-4 w-4 text-amber-500" aria-hidden /> : null}
                    {key === 'team' ? <Users className="h-4 w-4 text-primary" aria-hidden /> : null}
                    {title}
                  </CardTitle>
                  <CardDescription className="text-xs">{blurb}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-5 pb-5">
                  <ul className="flex-1 space-y-3 border-t border-border/70 pt-4 text-xs text-muted-foreground">
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
                      <p className="border-t border-border/70 pt-4 text-xs text-muted-foreground">
                         <strong className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">${ACTIPROC_PLANS[key].priceUsd}</strong>
                        {key === 'individual' ? '/year' : key === 'team' || key === 'pro' ? '/user/month' : '/month'}
                      </p>
                      <Button type="button" size="sm" variant={current ? 'secondary' : 'default'}
                         className={cn('h-11 w-full rounded-xl font-semibold transition-all', !current && 'bg-blue-600 text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,0.8)] hover:bg-blue-700')}
                        disabled={busy || !canUpgrade || (canResubscribe && !acceptNewCharge) ||
                          (!canResubscribe && (current || (billingPlan !== 'free' && ['individual','pro','team'].indexOf(key) <= ['individual','pro','team'].indexOf(billingPlan))))}
                        onClick={() => canResubscribe
                          ? void openCheckout(key, {billingInterval:key === 'individual' ? 'yearly' : 'monthly', resubscribe:true, acceptNewCharge})
                          : billingPlan === 'free'
                            ? void openCheckout(key, {billingInterval:key === 'individual' ? 'yearly' : 'monthly'})
                            : void requestPlanReview(key)}>
                        {canResubscribe ? 'Subscribe to ' + title : current ? 'Current plan' : !canUpgrade ? billingStatus === 'cancelled' ? 'Not available after cancellation' : 'Unavailable for this subscription' : 'Choose ' + title}
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
          {billingStatus === 'cancelled' && !canResubscribe ? ' New purchases for this organization will become available only after billing eligibility and database migration are verified.' : ''}
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