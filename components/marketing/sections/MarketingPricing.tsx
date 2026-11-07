'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Info, Sparkles } from 'lucide-react';
import { ACTIPROC_PLANS, actiprocPriceUsd, type BillingInterval } from '@/lib/billing-plans';
import { PLAN_MARKETING_FEATURES } from '@/lib/plan-entitlement-matrix';
import { AI_MAX_FUNDED_SEATS, AI_PLAN_LIMITS, aiPlanDailyDescription, type AIPlanKey } from '@/lib/ai/ai-plan-catalog';

const plans: {id:AIPlanKey;title:string;subtitle:string;features:readonly string[]}[] = [
  {id:'free',title:'Free',subtitle:'Find clarity in your first workflow.',
    features:PLAN_MARKETING_FEATURES.free},
  {id:'individual',title:'Individual',subtitle:'Personal structure with room to grow.',
    features:PLAN_MARKETING_FEATURES.individual},
  {id:'pro',title:'Pro',subtitle:'More space for growing work.',
    features:PLAN_MARKETING_FEATURES.pro},
  {id:'team',title:'Team',subtitle:'For shared execution and scale.',
    features:PLAN_MARKETING_FEATURES.team},
];

export function MarketingPricing() {
  const [billingInterval,setBillingInterval] = useState<BillingInterval>('monthly');
  return (
    <section id="pricing" className="ap-pricing-section scroll-mt-24 py-24 sm:py-28 lg:py-32" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <div className="grid items-end gap-6 md:grid-cols-[1fr_.75fr]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#5a7d5c]">05 / Transparent pricing</p>
            <h2 id="pricing-title" className="ap-section-title mt-5 max-w-[630px] text-[#162a20]">Start small. <span className="text-[#77937b]">Go further.</span></h2>
          </div>
          <p className="max-w-[435px] text-[14px] leading-[1.85] text-[#657a6a]">Choose the capacity you need today. Move to another plan as your processes and team grow.</p>
        </div>
        <div role="group" aria-label="Compare billing periods" className="mt-9 inline-flex gap-1.5 rounded-xl border border-[#d1e2ce] bg-white p-1.5 shadow-sm">
          {(['monthly','yearly'] as const).map(period=><button type="button" key={period}
            aria-pressed={billingInterval===period} onClick={()=>setBillingInterval(period)}
            className={'rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#387a53] '+
              (billingInterval===period?'bg-[#193b29] text-white':'text-[#42634d] hover:bg-[#eef6e9]')}>
            {period==='yearly'?'Yearly · save 16.7%':'Monthly'}
          </button>)}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plans.map(p=>{
            const featured=p.id==='pro';
            const paidSeat=p.id==='pro'||p.id==='team';
            const price=p.id==='free'?ACTIPROC_PLANS.free.priceUsd:
              actiprocPriceUsd(p.id,billingInterval);
            return (
              <article key={p.id} className={'relative flex min-w-0 flex-col rounded-[25px] border p-6 shadow-[0_15px_48px_-42px_rgba(31,88,48,.23)] transition-transform duration-300 hover:-translate-y-1 ' +
                (featured?'border-[#39704b] bg-[#193b29] text-white shadow-[0_21px_56px_-35px_rgba(17,66,36,.4)]':'border-[#dce5db] bg-white text-[#192c20]')}>
                {featured && <span className="absolute right-5 top-5 rounded-full bg-[#c8ff93] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#193b25]">Popular</span>}
                <p className={'text-[10px] font-semibold uppercase tracking-[.16em] '+(featured?'text-[#c6dfc5]':'text-[#5a8363]')}>
                  {p.id==='free'?'Get started':p.id==='individual'?'Solo momentum':p.id==='pro'?'Growing workflows':'Shared execution'}
                </p>
                <h3 className="mt-3 text-[22px] font-semibold tracking-[-.035em]">{p.title}</h3>
                <p className={'mt-2 min-h-[45px] text-[12px] leading-[1.8] '+(featured?'text-[#b6d0bb]':'text-[#778b7a]')}>{p.subtitle}</p>
                <div className="mt-6 flex flex-wrap items-baseline gap-1">
                  <strong className="text-[43px] leading-none tracking-[-.06em]">{'$'}{price}</strong>
                  <span className={'text-[11px] '+(featured?'text-[#b4ccbd]':'text-[#6f8973]')}>
                    {p.id==='free'?'/forever':p.id==='individual'?'/year':billingInterval==='yearly'?'/seat/year':'/seat/month'}
                  </span>
                </div>
                <div className={'mt-6 rounded-[16px] border px-3.5 py-3.5 '+(featured?'border-[#4b7958] bg-[#245038]':'border-[#d3e4d0] bg-[#f0f7eb]')}>
                  <p className={'inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.1em] '+(featured?'text-[#d8ffc0]':'text-[#517d56]')}>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden/> Included AI allowance
                  </p>
                  <p className="mt-2 text-[23px] font-semibold leading-none tabular-nums tracking-tight">
                    {AI_PLAN_LIMITS[p.id].monthlyBase.toLocaleString('en-US')}<span className={'ml-1 text-[10px] font-normal '+(featured?'text-[#b9d6bd]':'text-[#718979]')}>/ month</span>
                  </p>
                  <p className={'mt-2 text-[10px] leading-4 '+(featured?'text-[#c9dec6]':'text-[#718a76]')}>
                    {paidSeat?'Per paid seat · shared organization pool':'Included monthly allowance'}
                  </p>
                  <p className={'mt-1 text-[10px] leading-4 '+(featured?'text-[#c9dec6]':'text-[#718a76]')}>{aiPlanDailyDescription(p.id)}</p>
                </div>
                <div aria-hidden className={'my-6 h-px '+(featured?'bg-[#4c7558]':'bg-[#e5ebe3]')} />
                <ul className="flex-1 space-y-3">
                  {p.features.map(feature=><li key={feature} className="flex items-start gap-2.5 text-[12px] leading-relaxed">
                    <Check className={'mt-0.5 h-4 w-4 shrink-0 '+(featured?'text-[#d4ffb3]':'text-[#62876b]')} aria-hidden />{feature}
                  </li>)}
                </ul>
                <Link href={p.id==='free'?'/auth/signup':'/auth/signup?callbackUrl='+encodeURIComponent('/settings/billing?plan='+p.id+'&interval='+(p.id==='individual'?'yearly':billingInterval))}
                  className={'mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 '+
                    (featured?'bg-[#c8ff93] text-[#102518] hover:bg-white focus-visible:ring-[#c8ff93] focus-visible:ring-offset-[#193b29]':'border border-[#d6e5d2] bg-[#eef7ea] text-[#2c6140] hover:border-[#88b891] hover:bg-[#e7f1e3] focus-visible:ring-[#668e6d]')}>
                  {p.id==='free'?'Create account':'Explore '+p.title}<ArrowUpRight className="h-4 w-4" aria-hidden/>
                </Link>
              </article>
            );
          })}
        </div>
        <div className="mt-6 rounded-[18px] border border-[#d6e4d4] bg-white/80 p-4 sm:p-5">
          <p className="flex items-start gap-2.5 text-[11px] leading-[1.9] text-[#657967]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5b8662]" aria-hidden/>
            <span>AI allowances depend on plan, service availability and fair-use limits. Pro/Team monthly AI requests are pooled per organization and scale with verified paid seats up to {AI_MAX_FUNDED_SEATS}. Daily per-user limits also apply. Monthly resets follow UTC. No automatic overage charges.</span>
          </p>
        </div>
        <p className="mx-auto mt-4 max-w-4xl text-center text-[11px] leading-[1.8] text-[#7c8b7b]">
          USD list prices; any applicable taxes and final totals are confirmed during secure checkout. Individual renews yearly; Pro/Team offer monthly ($4/$6 per seat) and yearly ($40/$60 per seat) billing. Paid checkout availability is subject to billing readiness.
        </p>
      </div>
    </section>
  );
}
