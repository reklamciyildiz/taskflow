import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_NAME, CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '@/lib/site-config';
export const metadata: Metadata = {
 title: 'Refunds & cancellations — Actiproc',
 description: 'How Actiproc subscriptions are cancelled and how to request a refund.',
};
export default function RefundPolicyPage() {
 return <main className="min-h-screen bg-[#050505] px-4 py-16 text-zinc-200 sm:px-6">
  <article className="mx-auto max-w-3xl space-y-8">
   <header><Link href="/marketing" className="text-sm text-emerald-300">← Back to {APP_NAME}</Link>
    <h1 className="mt-8 text-4xl font-semibold tracking-tight">Refunds & cancellations</h1>
    <p className="mt-2 text-sm text-zinc-400">Updated {LEGAL_LAST_UPDATED}</p>
   </header>
   <section className="space-y-3"><h2 className="text-xl font-semibold">Cancel a subscription</h2>
    <p className="text-zinc-400">Open Settings → Billing in the Actiproc application and use the customer portal for the payment provider shown on your account. Cancelling a recurring subscription stops future renewals; access normally continues until the end of the paid period unless the provider&rsquo;s terms or a refund require earlier termination.</p>
   </section>
   <section className="space-y-3"><h2 className="text-xl font-semibold">Request a refund</h2>
    <p className="text-zinc-400">Contact <a className="text-emerald-300 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the purchase date, email used at checkout and a description of the issue. Do not send card numbers or passwords. Refund eligibility is assessed under applicable consumer law, the applicable checkout terms and the merchant-of-record&rsquo;s procedures. This page does not restrict statutory refund rights.</p>
   </section>
   <section className="space-y-3"><h2 className="text-xl font-semibold">Who processes the refund?</h2>
    <p className="text-zinc-400">Subscriptions will be processed by Creem once checkout is activated. The merchant of record is shown at checkout and on your receipt. Any approved refunds are processed by that provider, not by an unverified personal bank transfer.</p>
   </section>
   <nav className="flex gap-6 border-t border-white/10 pt-6 text-sm"><Link href="/terms" className="text-emerald-300">Terms</Link><Link href="/privacy" className="text-emerald-300">Privacy</Link></nav>
  </article>
 </main>;
}
