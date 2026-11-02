import Link from 'next/link';
import { ArrowUpRight, Check, Info, Sparkles } from 'lucide-react';
import { ACTIPROC_PLANS } from '@/lib/billing-plans';
import {
  AI_MAX_FUNDED_SEATS, AI_PLAN_LIMITS, aiPlanDailyDescription, type AIPlanKey,
} from '@/lib/ai/ai-plan-catalog';

const cards: {
  id: AIPlanKey;
  title: string;
  tagline: string;
  features: readonly string[];
  cta: string;
}[] = [
  { id: 'free', title: 'Free', tagline: 'Start with one process', features: ['1 process', '1 workspace', 'Tasks and checklists', 'Knowledge Hub'], cta: 'Create account' },
  { id: 'individual', title: 'Individual', tagline: 'A personal workflow system', features: ['3 processes', '1 workspace', 'Notes and Knowledge Hub', 'Yearly billing'], cta: 'Choose Individual' },
  { id: 'pro', title: 'Pro', tagline: 'More room to execute', features: ['10 processes', 'Up to 3 workspaces', 'Advanced reminders', 'Google Calendar integration'], cta: 'Choose Pro' },
  { id: 'team', title: 'Team', tagline: 'Coordinate work together', features: ['Unlimited processes', 'Unlimited workspaces', 'Roles and assignments', 'Webhooks'], cta: 'Choose Team' },
];

export function MarketingPricing() {
  const betaRollout = process.env.AXIOM_AI_BETA_MODE_ENABLED !== 'false';
  return (
    <section id="pricing" aria-labelledby="pricing-title"
      className="scroll-mt-24 border-t border-white/[0.06] bg-[#050505] px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Pricing</p>
        <h2 id="pricing-title" className="mt-4 text-center text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Start simple. Scale on your terms.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-zinc-400 sm:text-base">
          Choose your workspace capacity and a transparent monthly Actiproc AI allowance.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((p) => {
            const price = ACTIPROC_PLANS[p.id].priceUsd;
            const featured = p.id === 'pro';
            return (
              <article key={p.id} className={`group relative flex flex-col overflow-hidden rounded-[25px] border p-6 shadow-[0_26px_62px_-48px_rgba(0,0,0,0.8)] transition-colors hover:border-emerald-400/45 ${featured ? 'border-emerald-400/35 bg-gradient-to-b from-emerald-500/[0.11] via-zinc-950 to-zinc-950' : 'border-white/10 bg-zinc-950/75'}`}>
                {featured && <div className="absolute right-0 top-0 rounded-bl-xl bg-emerald-400/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">For growing workflows</div>}
                <h3 className="text-lg font-semibold text-white">{p.title}</h3>
                <p className="mt-1 min-h-10 text-sm text-zinc-400">{p.tagline}</p>
                <div className="mt-4 border-b border-white/10 pb-5">
                  <span className="text-4xl font-semibold tracking-tight text-white">${price}</span>
                  <span className="ml-1 text-xs text-zinc-400">{p.id === 'free' ? 'forever' : p.id === 'individual' ? '/year' : '/user/month'}</span>
                </div>

                <div className="mt-5 rounded-[18px] border border-emerald-300/15 bg-emerald-300/[0.055] p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-300">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden /> Actiproc AI
                  </div>
                  <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-white">
                    {AI_PLAN_LIMITS[p.id].monthlyBase.toLocaleString('en-US')}
                    <span className="ml-1.5 text-xs font-medium text-emerald-200/75">requests / month</span>
                  </p>
                  <p className="mt-2 text-xs text-zinc-300">
                    {AI_PLAN_LIMITS[p.id].perSeat ? 'Per paid seat · shared organization pool' : 'Included monthly allowance'}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">{aiPlanDailyDescription(p.id)}</p>
                </div>
                <ul className="mt-6 flex flex-1 flex-col gap-3 text-[13px] text-zinc-300">
                  {p.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href={p.id === 'free' ? '/auth/signup' : `/auth/signup?callbackUrl=${encodeURIComponent('/settings/billing?plan=' + p.id)}`}
                  className={`mt-8 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${featured ? 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300' : 'border border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]'}`}>
                  {p.cta}<ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              </article>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-xs text-zinc-400 sm:flex-row sm:items-center sm:p-5">
          <p className="max-w-3xl leading-relaxed">
            <Info className="mr-1 inline h-3.5 w-3.5 text-emerald-300" aria-hidden />
            AI allowances are subject to fair use: a shared monthly organization pool, per-user daily caps, and up to {AI_MAX_FUNDED_SEATS} funded seats for Pro/Team.
            No automatic overage charges. Monthly AI rights reset on the UTC calendar month, including for annually billed Individual.
          </p>
          <span className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${betaRollout ? 'border-amber-400/25 bg-amber-500/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`}>
            {betaRollout ? 'AI access: staged beta rollout' : 'AI access: subject to service readiness'}
          </span>
        </div>
        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
          USD prices include applicable tax under our Creem pricing configuration. Final tax and total appear at checkout.
          Individual renews annually; Pro and Team renew monthly. AI allowances are included when AI access is available.
        </p>
      </div>
    </section>
  );
}
