'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, CircleAlert, CreditCard, Info, ShieldCheck, Sparkles, X } from 'lucide-react';
import { AI_PLAN_LIMITS, aiPlanDailyDescription } from '@/lib/ai/ai-plan-catalog';
import { actiprocPriceUsd, type BillingInterval } from '@/lib/billing-plans';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isCapacitorNative } from '@/lib/client/is-capacitor-native';

type UpgradePlan = 'individual' | 'pro' | 'team';
type UpgradeReason = 'teams' | 'processes' | 'webhooks' | 'seats';

const FEATURES: Record<UpgradePlan, readonly string[]> = {
  individual: ['1 verified seat', '1 workspace', 'Up to 3 processes', 'Annual billing'],
  pro: ['Up to 3 workspaces', 'Up to 10 processes', 'Advanced reminders', 'Google Calendar'],
  team: ['Unlimited workspaces', 'Unlimited processes', 'Webhooks', 'Per-seat subscription'],
};

const DESCRIPTIONS: Record<UpgradePlan, string> = {
  individual: 'Focused work for one person',
  pro: 'More room for growing workflows',
  team: 'Collaboration without workspace limits',
};

const reasonCopy: Record<UpgradeReason, { title: string; description: string }> = {
  teams: { title: 'More room for your team',
    description: 'Your current plan has reached its workspace limit. Move to Team to scale without a fixed workspace cap.' },
  processes: { title: 'Keep work moving',
    description: 'Your current plan has reached its Process limit. Choose more capacity without changing your existing work.' },
  webhooks: { title: 'Connect your workflows',
    description: 'Webhooks are included with the Team plan. Connect Actiproc to your existing tools and automations.' },
  seats: { title: 'Grow your workspace',
    description: 'Your organization has reached its seat allowance. Review the available plans or manage seats in Billing.' },
};

async function startUpgrade(plan: UpgradePlan, interval: BillingInterval): Promise<void> {
  const response = await fetch('/api/billing/summary', { cache: 'no-store' });
  const summary = await response.json().catch(() => null);
  if (!response.ok || !summary?.success)
    throw new Error('We could not verify your billing access. Please open Billing settings and retry.');
  const current = String(summary.data?.plan ?? 'free');
  const existingSubscription = Boolean(summary.data?.subscriptionId);
  const currentOrder = ['free', 'individual', 'pro', 'team'];
  if (currentOrder.indexOf(plan) <= currentOrder.indexOf(current))
    throw new Error('This plan is already active or below your current plan. Manage it from Billing settings.');

  if (existingSubscription || current !== 'free') {
    // An existing subscription MUST pass the dedicated preview + signed
    // confirmation flow. Never POST to switch-plan from an upgrade popover.
    window.location.assign('/settings/billing?plan=' + encodeURIComponent(plan)+'&interval='+encodeURIComponent(interval));
    return;
  }

  const checkout = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, billingInterval: plan === 'individual' ? 'yearly' : interval }),
  });
  const result = await checkout.json().catch(() => null);
  if (!checkout.ok || !result?.success) {
    if (checkout.status === 503)
      throw new Error('Secure checkout is not yet available. Your plan has not changed.');
    throw new Error(result?.error || 'Checkout could not be started. No payment was initiated.');
  }
  const url = result?.data?.url;
  if (typeof url !== 'string' || !/^https:\/\/[^/]+/i.test(url))
    throw new Error('The secure checkout link could not be verified.');
  window.location.assign(url);
}

export function UpgradePlanModal(props: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  recommendedPlan?: UpgradePlan | null;
  reason?: UpgradeReason;
}) {
  const { open, onClose, title, description, recommendedPlan, reason } = props;
  const [busy, setBusy] = useState<UpgradePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval,setBillingInterval] = useState<BillingInterval>('monthly');
  const isNativeApp = typeof window !== 'undefined' && isCapacitorNative();
  const plans = useMemo<UpgradePlan[]>(() => {
    if (recommendedPlan === 'team' || reason === 'webhooks' || reason === 'teams') return ['team'];
    if (reason === 'seats' || recommendedPlan === 'pro') return ['pro', 'team'];
    return ['individual', 'pro', 'team'];
  }, [recommendedPlan, reason]);
  const onePlan = plans.length === 1;
  const message = reasonCopy[reason ?? 'processes'];

  const close = () => { if (!busy) { setError(null); onClose(); } };
  const upgrade = async (plan: UpgradePlan) => {
    if (busy) return;
    setError(null);
    setBusy(plan);
    try { await startUpgrade(plan,billingInterval); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to start billing.'); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent
        aria-describedby="upgrade-plan-description"
        className={cn(
          'z-[520] w-[calc(100vw-1.5rem)] max-h-[min(92dvh,850px)] overflow-y-auto rounded-[24px] border border-white/[0.13] bg-[#192126] p-0 text-zinc-50 shadow-[0_32px_100px_-25px_rgba(0,0,0,.75)]',
          onePlan ? 'sm:max-w-[790px]' : plans.length === 2 ? 'sm:max-w-[820px]' : 'sm:max-w-[1040px]'
        )}
        overlayClassName="z-[519] bg-black/70 backdrop-blur-sm"
        hideClose
      >
        <div className="relative overflow-hidden px-5 pb-5 pt-5 sm:px-7 sm:pb-7 sm:pt-7">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-40 h-80 w-80 rounded-full bg-[#C8FF93]/[0.10] blur-[75px]" />
          <button type="button" onClick={close} disabled={busy !== null} aria-label="Close upgrade dialog"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF93] disabled:opacity-50">
            <X className="h-4 w-4" aria-hidden />
          </button>
          <div className={cn('relative grid min-w-0 gap-6', onePlan && 'md:grid-cols-[minmax(0,1fr)_minmax(0,345px)] md:items-center md:gap-8')}>
            <div className={cn('min-w-0 pr-8', !onePlan && 'max-w-2xl')}>
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#C8FF93]/20 bg-[#C8FF93]/10 text-[#C8FF93]">
                <Sparkles className="h-[21px] w-[21px]" aria-hidden />
              </div>
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-balance text-[27px] font-semibold tracking-[-0.045em] text-white sm:text-[32px]">
                  {title ?? message.title}
                </DialogTitle>
                <DialogDescription id="upgrade-plan-description" className="max-w-lg text-[13px] leading-[1.7] text-slate-300">
                  {description ?? message.description}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] leading-5 text-slate-400">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Verified billing</span>
                <span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-[#C8FF93]" aria-hidden /> Secured by Creem</span>
              </div>
              {onePlan && <Button variant="ghost" onClick={close} disabled={busy !== null}
                className="mt-6 hidden h-9 px-0 text-slate-300 hover:bg-transparent hover:text-white md:inline-flex">
                Not now
              </Button>}
            </div>
            <div role="group" aria-label="Choose a billing period" className="mb-4 inline-flex gap-1 rounded-xl border border-white/15 bg-white/5 p-1">
              {(['monthly','yearly'] as const).map(period=>
                <button key={period} type="button" aria-pressed={billingInterval===period}
                  disabled={busy!==null} onClick={()=>setBillingInterval(period)}
                  className={cn('rounded-lg px-3.5 py-2 text-[11px] font-semibold transition',
                    billingInterval===period?'bg-[#c8ff93] text-[#122519]':'text-slate-300 hover:bg-white/10')}
                >{period==='yearly'?'Yearly · save 16.7%':'Monthly'}</button>)}
            </div>
            <div className={cn('grid min-w-0 gap-3.5', onePlan ? 'grid-cols-1' : plans.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
              {plans.map((plan) => {
                const featured = recommendedPlan === plan || (onePlan && plan === 'team');
                const annual = plan === 'individual' || billingInterval==='yearly';
                const price = actiprocPriceUsd(plan,annual?'yearly':'monthly');
                return (
                  <section key={plan} aria-label={plan + ' plan'} className={cn(
                    'relative flex min-w-0 flex-col rounded-[20px] border bg-white/[0.045] p-[19px] shadow-[0_20px_46px_-33px_rgba(0,0,0,0.7)]',
                    featured ? 'border-[#C8FF93]/40 ring-1 ring-[#C8FF93]/[0.12]' : 'border-white/[0.12]'
                  )}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[15px] font-semibold text-white capitalize">{plan}</h3>
                      {featured && <span className="rounded-full border border-[#C8FF93]/20 bg-[#C8FF93]/[0.10] px-2 py-0.5 text-[10px] font-semibold text-[#DBF6C8]">Recommended</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{DESCRIPTIONS[plan]}</p>
                    <div className="mt-5 flex flex-wrap items-baseline gap-1">
                      <strong className="text-[38px] font-semibold leading-none tracking-[-0.055em] text-white">${price}</strong>
                      <span className="text-[11px] text-slate-400">{plan==='individual'?'/year':annual?'/seat/year':'/seat/month'}</span>
                    </div>
                    <div className="mt-4 rounded-[13px] border border-emerald-400/15 bg-emerald-400/[0.07] px-3.5 py-3">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Included AI
                      </div>
                      <p className="mt-1 text-[18px] font-semibold tabular-nums text-white">{AI_PLAN_LIMITS[plan].monthlyBase.toLocaleString('en-US')}
                        <span className="ml-1 text-[10.5px] font-normal text-slate-300">requests/month</span>
                      </p>
                      <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{aiPlanDailyDescription(plan)}</p>
                      {(plan === "pro" || plan === "team") && (
                        <p className="mt-1 text-[10px] leading-4 text-slate-400">Per verified paid seat · shared organization allowance (up to 20 funded seats).</p>
                      )}
                    </div>
                    <ul className="mt-4 flex-1 space-y-2.5 text-[11px] leading-5 text-slate-300">
                      {FEATURES[plan].map(feature => <li key={feature} className="flex gap-2">
                        <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden /><span>{feature}</span>
                      </li>)}
                    </ul>
                    {isNativeApp ? (
                      <p className="mt-5 rounded-lg border border-[#C8FF93]/20 bg-[#C8FF93]/[0.08] px-3 py-2.5 text-[11px] leading-5 text-[#DBF6C8]">
                        Purchases and plan upgrades are unavailable in the native app. Manage your subscription on the web.
                      </p>
                    ) : (
                      <Button type="button" onClick={() => void upgrade(plan)} disabled={busy !== null}
                        className="mt-5 h-10 w-full gap-2 rounded-xl bg-[#C8FF93] font-semibold text-[#102518] hover:bg-[#E4FFC7] focus-visible:ring-[#C8FF93]">
                        {busy === plan ? 'Checking billing…' : 'Continue securely'}
                        {busy !== plan && <ArrowRight className="h-4 w-4" aria-hidden />}
                      </Button>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
          {error && <div role="alert" className="relative mt-5 flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-4 py-3 text-[12px] leading-5 text-amber-100">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </div>}
          <div className="relative mt-5 flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 text-[10.5px] leading-[1.65] text-slate-400">
            <Info className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[#C8FF93]" aria-hidden />
            <p>Prices are shown in USD. Final payable totals, renewal dates, and any applicable taxes are confirmed during Creem checkout or the Billing review. No automatic usage overage charges. AI limits reset monthly (UTC).</p>
          </div>
          {!onePlan && <button type="button" onClick={close} disabled={busy !== null}
            className="relative mt-4 text-[12px] font-medium text-slate-400 hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF93]">
            Not now
          </button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
