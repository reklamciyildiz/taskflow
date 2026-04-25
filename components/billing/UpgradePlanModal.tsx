'use client';

import { useMemo, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Interval = 'monthly' | 'yearly';
type UpgradePlan = 'pro' | 'team';
type UpgradeReason = 'teams' | 'processes' | 'webhooks' | 'seats';

const PRICES = {
  pro: { monthly: 8, yearly: 72 }, // $6/seat/mo billed annually
  team: { monthly: 15, yearly: 144 }, // $12/seat/mo billed annually
} as const;

const FEATURES: Record<UpgradePlan, readonly string[]> = {
  pro: [
    'Up to 3 teams / workspaces',
    'Up to 10 processes',
    'Advanced reminders + Google Calendar',
  ],
  team: [
    'Unlimited teams / workspaces',
    'Unlimited processes',
    'Webhooks',
    'Starts at 2 seats',
  ],
} as const;

function isHighlightedFeature(reason: UpgradeReason | undefined, plan: UpgradePlan, feature: string): boolean {
  if (!reason) return false;
  if (reason === 'teams') return plan === 'team' && feature === 'Unlimited teams / workspaces';
  if (reason === 'processes') return plan === 'team' && feature === 'Unlimited processes';
  if (reason === 'webhooks') return plan === 'team' && feature === 'Webhooks';
  if (reason === 'seats') return plan === 'team' && feature === 'Starts at 2 seats';
  return false;
}

async function ensureLemon(): Promise<void> {
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
}

async function openCheckout(plan: UpgradePlan): Promise<void> {
  const resp = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan === 'team' ? { plan: 'team', seats: 2 } : { plan: 'pro' }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json?.success) {
    throw new Error(json?.error || 'Could not start checkout');
  }
  const url = json?.data?.url;
  if (typeof url !== 'string' || !url) throw new Error('Checkout URL missing');
  await ensureLemon();
  const w = window as Window & { LemonSqueezy?: { Url?: { Open?: (u: string) => void } } };
  if (w.LemonSqueezy?.Url?.Open) w.LemonSqueezy.Url.Open(url);
  else window.location.href = url;
}

export function UpgradePlanModal(props: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  /** Suggested plan to pre-highlight. */
  recommendedPlan?: UpgradePlan | null;
  /** Why the user hit this upgrade wall (for personalized copy). */
  reason?: UpgradeReason;
}) {
  const { open, onClose, title, description, recommendedPlan, reason } = props;
  const [interval, setInterval] = useState<Interval>('monthly');
  const [busy, setBusy] = useState<UpgradePlan | null>(null);

  const plans: UpgradePlan[] = useMemo(() => {
    // If Team is explicitly required (e.g. user is already on Pro), remove Pro to reduce decision fatigue.
    if (recommendedPlan === 'team') return ['team'];
    return ['pro', 'team'];
  }, [recommendedPlan]);

  const defaultCopy = useMemo(() => {
    const wants = reason ?? 'processes';
    if (wants === 'teams') {
      return {
        title: 'Unlock more workspaces',
        description: 'You’ve hit your team/workspace limit. Upgrade to create more.',
      };
    }
    if (wants === 'webhooks') {
      return {
        title: 'Unlock webhooks',
        description: 'Webhooks are available on the Team plan — upgrade to connect Axiom to the outside world.',
      };
    }
    if (wants === 'seats') {
      return {
        title: 'Add more seats',
        description: 'You’ve reached your seat limit. Upgrade or add seats to invite more people.',
      };
    }
    return {
      title: 'Unlock more processes',
      description: 'You’ve hit your process limit. Upgrade to create more.',
    };
  }, [reason]);

  const handleUpgrade = async (plan: UpgradePlan) => {
    setBusy(plan);
    try {
      await openCheckout(plan);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent
        className={cn(
          // Ensure this overlay sits above any already-open dialog (e.g. Create Team).
          'z-[520] max-w-5xl p-0 overflow-hidden border-white/10 bg-[#0b0b10]/85 text-zinc-50',
          'shadow-[0_30px_120px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl',
          'sm:rounded-[28px]'
        )}
        overlayClassName={cn(
          // Softer, more premium background + blur.
          'z-[519] bg-black/60 backdrop-blur-md'
        )}
        hideClose
      >
        {/* Top bar: close + interval */}
        <div className="relative flex items-center justify-end gap-3 px-6 pt-5">
          <div className="mr-auto" />
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setInterval('monthly')}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                interval === 'monthly' ? 'bg-white/10 text-white' : 'text-zinc-300/70 hover:text-zinc-100'
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval('yearly')}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                interval === 'yearly' ? 'bg-white/10 text-white' : 'text-zinc-300/70 hover:text-zinc-100'
              )}
            >
              Yearly
              <span className="ml-1.5 rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
                -20%
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200/80 transition-colors hover:bg-white/[0.07] hover:text-zinc-50"
            disabled={busy !== null}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 px-6 pb-7 pt-4 md:grid-cols-[1.15fr_1.85fr] md:gap-10">
          {/* Left: message */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[28px] bg-violet-500/10 blur-2xl" aria-hidden />
            <DialogHeader className="text-left">
              <DialogTitle className="text-4xl font-semibold tracking-tight text-zinc-50">
                {title ?? defaultCopy.title.split(' ').slice(0, 2).join(' ')}{' '}
                <span className="bg-gradient-to-r from-violet-200 via-white to-emerald-200 bg-clip-text text-transparent">
                  {title ? '' : defaultCopy.title.split(' ').slice(2).join(' ')}
                </span>
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-sm text-base leading-relaxed text-zinc-300/80">
                {description ?? defaultCopy.description}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 text-sm leading-relaxed text-zinc-200/70">
              Faster, smarter, and more collaborative.
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-8 w-full border-white/15 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.07]"
              onClick={onClose}
              disabled={busy !== null}
            >
              Not now
            </Button>
          </div>

          {/* Right: plans */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {plans.map((p) => {
              const isRecommended = recommendedPlan === p;
              const price = interval === 'monthly' ? PRICES[p].monthly : PRICES[p].yearly;
              const suffix = interval === 'monthly' ? '/seat' : '/seat';
              const period = interval === 'monthly' ? '/mo' : '/yr';
              const accent =
                // Superlist-ish: keep the palette cohesive and premium (violet for both, emerald as a subtle hint).
                p === 'team'
                  ? 'from-violet-500/16 via-emerald-500/5 to-transparent'
                  : 'from-violet-500/16 via-violet-500/6 to-transparent';

              return (
                <div
                  key={p}
                  className={cn(
                    // Softer surfaces: lower-contrast border + slightly dimmer card fill.
                    'relative overflow-hidden rounded-3xl border border-white/[0.10] bg-white/[0.035] p-5',
                    'shadow-[0_20px_70px_-40px_rgba(0,0,0,0.9)]',
                    isRecommended && 'ring-1 ring-violet-400/30'
                  )}
                >
                  <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-b', accent)} aria-hidden />

                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-50">{p === 'pro' ? 'Pro' : 'Team'}</p>
                        {p === 'team' ? <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden /> : null}
                        {isRecommended ? (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-100/85">
                            Recommended
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-snug text-zinc-100/60">
                        {p === 'pro' ? 'Small teams' : 'Scale + webhooks'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1">
                        <p className="text-[42px] leading-none font-semibold tabular-nums text-zinc-50">${price}</p>
                        <p className="text-xs leading-none text-zinc-100/55">
                          {suffix}
                          <span className="text-zinc-100/45">{period}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    className={cn(
                      'relative mt-4 h-10 w-full rounded-full font-semibold tracking-tight',
                      p === 'team'
                        ? 'bg-violet-500 text-white hover:bg-violet-400'
                        : 'bg-violet-500 text-white hover:bg-violet-400'
                    )}
                    disabled={busy !== null}
                    onClick={() => void handleUpgrade(p)}
                  >
                    {busy === p ? 'Opening checkout…' : 'Upgrade'}
                  </Button>

                  <ul className="relative mt-4 space-y-2.5 text-xs leading-relaxed text-zinc-100/75">
                    {FEATURES[p].map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            isHighlightedFeature(reason, p, f) ? 'text-emerald-300' : 'text-zinc-100/45'
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            isHighlightedFeature(reason, p, f) &&
                              'rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200'
                          )}
                        >
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

