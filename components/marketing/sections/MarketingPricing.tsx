import Link from 'next/link';
import { ArrowUpRight, Check, Info, Sparkles } from 'lucide-react';
import { ACTIPROC_PLANS } from '@/lib/billing-plans';
import { AI_MAX_FUNDED_SEATS, AI_PLAN_LIMITS, aiPlanDailyDescription, type AIPlanKey } from '@/lib/ai/ai-plan-catalog';

const plans: {id:AIPlanKey;title:string;subtitle:string;features:readonly string[]}[] = [
  {id:'free',title:'Free',subtitle:'Find clarity in your first workflow.',
    features:['1 process','1 workspace','Actions and checklists','Notes & Knowledge Hub']},
  {id:'individual',title:'Individual',subtitle:'Personal structure with room to grow.',
    features:['3 processes','1 workspace','Notes & Knowledge Hub','Yearly billing']},
  {id:'pro',title:'Pro',subtitle:'More space for growing work.',
    features:['10 processes','Up to 3 workspaces','Advanced reminders','Google Calendar']},
  {id:'team',title:'Team',subtitle:'For shared execution and scale.',
    features:['Unlimited processes','Unlimited workspaces','Roles and assignments','Webhooks']},
];

export function MarketingPricing() {
  return (
    <section id="pricing" className="ap-pricing-section scroll-mt-24 py-24 sm:py-28 lg:py-32" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-[1250px] px-5 sm:px-8 lg:px-10">
        <div className="grid items-end gap-6 md:grid-cols-[1fr_.75fr]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#5777a7]">05 / Transparent pricing</p>
            <h2 id="pricing-title" className="ap-section-title mt-5 max-w-[630px] text-[#1d2c48]">Start small. <span className="text-[#7187ac]">Go further.</span></h2>
          </div>
          <p className="max-w-[435px] text-[14px] leading-[1.85] text-[#62738c]">Choose the capacity you need today. Move to another plan as your processes and team grow.</p>
        </div>
        <div className="mt-12 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plans.map(p=>{
            const featured=p.id==='pro';
            const paidSeat=p.id==='pro'||p.id==='team';
            const price=ACTIPROC_PLANS[p.id].priceUsd;
            return (
              <article key={p.id} className={'relative flex min-w-0 flex-col rounded-[25px] border p-6 shadow-[0_15px_48px_-42px_rgba(36,59,105,.35)] transition-transform duration-300 hover:-translate-y-1 ' +
                (featured?'border-[#4d6591] bg-[#1b3052] text-white shadow-[0_21px_56px_-35px_rgba(21,48,91,.55)]':'border-[#dbe3f0] bg-white text-[#1e2c43]')}>
                {featured && <span className="absolute right-5 top-5 rounded-full bg-[#b9cfff] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#172e54]">Popular</span>}
                <p className={'text-[10px] font-semibold uppercase tracking-[.16em] '+(featured?'text-[#acbded]':'text-[#6480af]')}>
                  {p.id==='free'?'Get started':p.id==='individual'?'Solo momentum':p.id==='pro'?'Growing workflows':'Shared execution'}
                </p>
                <h3 className="mt-3 text-[22px] font-semibold tracking-[-.035em]">{p.title}</h3>
                <p className={'mt-2 min-h-[45px] text-[12px] leading-[1.8] '+(featured?'text-[#b6c5df]':'text-[#71819a]')}>{p.subtitle}</p>
                <div className="mt-6 flex flex-wrap items-baseline gap-1">
                  <strong className="text-[43px] leading-none tracking-[-.06em]">{'$'}{price}</strong>
                  <span className={'text-[11px] '+(featured?'text-[#b2c0d8]':'text-[#667895]')}>
                    {p.id==='free'?'/forever':p.id==='individual'?'/year':'/seat/month'}
                  </span>
                </div>
                <div className={'mt-6 rounded-[16px] border px-3.5 py-3.5 '+(featured?'border-[#435e8c] bg-[#293f64]':'border-[#dbe5f6] bg-[#f2f6fd]')}>
                  <p className={'inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.1em] '+(featured?'text-[#b9ccff]':'text-[#5378ac]')}>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden/> Included AI allowance
                  </p>
                  <p className="mt-2 text-[23px] font-semibold leading-none tabular-nums tracking-tight">
                    {AI_PLAN_LIMITS[p.id].monthlyBase.toLocaleString('en-US')}<span className={'ml-1 text-[10px] font-normal '+(featured?'text-[#b2c3df]':'text-[#6a7c96]')}>/ month</span>
                  </p>
                  <p className={'mt-2 text-[10px] leading-4 '+(featured?'text-[#adbfdd]':'text-[#74849b]')}>
                    {paidSeat?'Per paid seat · shared organization pool':'Included monthly allowance'}
                  </p>
                  <p className={'mt-1 text-[10px] leading-4 '+(featured?'text-[#adbfdd]':'text-[#74849b]')}>{aiPlanDailyDescription(p.id)}</p>
                </div>
                <div aria-hidden className={'my-6 h-px '+(featured?'bg-[#4a5f81]':'bg-[#e3e9f2]')} />
                <ul className="flex-1 space-y-3">
                  {p.features.map(feature=><li key={feature} className="flex items-start gap-2.5 text-[12px] leading-relaxed">
                    <Check className={'mt-0.5 h-4 w-4 shrink-0 '+(featured?'text-[#b9d3ff]':'text-[#5f83bc]')} aria-hidden />{feature}
                  </li>)}
                </ul>
                <Link href={p.id==='free'?'/auth/signup':'/auth/signup?callbackUrl='+encodeURIComponent('/settings/billing?plan='+p.id)}
                  className={'mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 '+
                    (featured?'bg-[#bcd1ff] text-[#102442] hover:bg-white focus-visible:ring-[#bcd1ff] focus-visible:ring-offset-[#1b3052]':'border border-[#d3deef] bg-[#edf3fd] text-[#2a4b7f] hover:border-[#91aee1] hover:bg-[#e3ecfd] focus-visible:ring-[#6189cc]')}>
                  {p.id==='free'?'Create account':'Explore '+p.title}<ArrowUpRight className="h-4 w-4" aria-hidden/>
                </Link>
              </article>
            );
          })}
        </div>
        <div className="mt-6 rounded-[18px] border border-[#d5dfed] bg-white/80 p-4 sm:p-5">
          <p className="flex items-start gap-2.5 text-[11px] leading-[1.9] text-[#667891]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5b7bb1]" aria-hidden/>
            <span>AI allowances depend on plan, service availability and fair-use limits. Pro/Team monthly AI requests are pooled per organization and scale with verified paid seats up to {AI_MAX_FUNDED_SEATS}. Daily per-user limits also apply. Monthly resets follow UTC. No automatic overage charges.</span>
          </p>
        </div>
        <p className="mx-auto mt-4 max-w-4xl text-center text-[11px] leading-[1.8] text-[#7a899f]">
          USD list prices; any applicable taxes and final totals are confirmed during secure checkout. Individual renews yearly, Pro/Team monthly. Paid checkout availability is subject to billing readiness.
        </p>
      </div>
    </section>
  );
}
