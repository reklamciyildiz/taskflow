import Link from 'next/link';
import { Check } from 'lucide-react';
import { ACTIPROC_PLANS } from '@/lib/billing-plans';
const cards = [
 { id: 'free', title: 'Free', tagline: 'Start with one process', features: ['1 process', '1 workspace', 'Tasks and checklists', 'Knowledge Hub'], cta: 'Create account' },
 { id: 'individual', title: 'Individual', tagline: 'A personal workflow system', features: ['3 processes', '1 workspace', 'Notes and Knowledge Hub', 'Yearly billing'], cta: 'Choose Individual' },
 { id: 'pro', title: 'Pro', tagline: 'More room to execute', features: ['10 processes', 'Up to 3 workspaces', 'Advanced reminders', 'Google Calendar integration'], cta: 'Choose Pro' },
 { id: 'team', title: 'Team', tagline: 'Coordinate work together', features: ['Unlimited processes', 'Unlimited workspaces', 'Roles and assignments', 'Signed webhooks'], cta: 'Choose Team' },
] as const;
export function MarketingPricing() {
 return <section id="pricing" className="scroll-mt-24 border-t border-white/[0.06] bg-[#050505] px-4 py-24 sm:px-6">
  <div className="mx-auto max-w-6xl">
   <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Pricing</p>
   <h2 className="mt-4 text-center text-4xl font-semibold text-white sm:text-5xl">Start simple. Scale on your terms.</h2>
   <p className="mx-auto mt-4 text-center text-zinc-400">For one person or a team, choose the capacity you need.</p>
   <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map(p=>{
    const price = ACTIPROC_PLANS[p.id].priceUsd;
    return <article key={p.id} className={`flex flex-col rounded-2xl border p-6 ${p.id==='pro'?'border-emerald-400/40 bg-emerald-500/[0.08]':'border-white/10 bg-zinc-950/70'}`}>
     <h3 className="text-lg font-semibold text-white">{p.title}</h3>
     <p className="mt-1 min-h-10 text-sm text-zinc-400">{p.tagline}</p>
     <div className="mt-5 border-b border-white/10 pb-6"><span className="text-4xl font-semibold text-white">${price}</span><span className="ml-1 text-xs text-zinc-400">{p.id==='free'?'forever':p.id==='individual'?'/year':p.id==='team'||p.id==='pro'?'/user/month':'/month'}</span></div>
     <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-zinc-300">{p.features.map(f=><li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"/>{f}</li>)}</ul>
     <Link href={p.id==='free'?'/auth/signup':`/auth/signup?callbackUrl=${encodeURIComponent('/settings/billing?plan='+p.id)}`} className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold ${p.id==='pro'?'bg-emerald-500 text-zinc-950 hover:bg-emerald-400':'border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.10]'}`}>{p.cta}</Link>
    </article>})}</div>
   <p className="mt-8 text-center text-xs text-zinc-500">USD prices include applicable tax under our Creem pricing configuration. The final amount and any tax are shown at checkout. Individual renews annually; Pro and Team renew monthly.</p>
  </div>
 </section>;
}
