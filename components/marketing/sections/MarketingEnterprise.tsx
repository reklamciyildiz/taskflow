import { Webhook, Building2, Shield, Link2 } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const webhookEvents = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.deleted',
  'customer.created',
  'team.member_added',
] as const;

export function MarketingEnterprise() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">
              Enterprise ready
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl">
              Customers & webhooks — connected to the outside world.
            </h2>
            <p className="mt-4 text-base text-zinc-500">
              Axiom supports customer management and an organization-scoped webhook system so your
              workflows can trigger automations in external tools. Secure by design, built for real B2B
              operations.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  title: 'Customer Management',
                  body: 'Track customers alongside work — a practical B2B layer.',
                  icon: Building2,
                },
                {
                  title: 'Webhook Integrations',
                  body: 'Subscribe to task, customer, and team events via API.',
                  icon: Webhook,
                },
                {
                  title: 'Signed payloads',
                  body: 'HMAC signatures for verification and safe ingestion.',
                  icon: Shield,
                },
                {
                  title: 'Detailed logs',
                  body: 'Webhook delivery is tracked with retry and visibility.',
                  icon: Link2,
                },
              ].map((it) => {
                const Icon = it.icon;
                return (
                  <div
                    key={it.title}
                    className={cn(
                      'rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-5 ring-1 ring-white/[0.04]',
                      'transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_36px_-16px_rgba(16,185,129,0.2)]'
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <p className="mt-3 text-sm font-semibold tracking-tight text-zinc-100">{it.title}</p>
                    <p className="mt-1 text-sm text-zinc-500">{it.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-emerald-500/[0.08] blur-3xl" aria-hidden />
            <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-6 ring-1 ring-white/[0.04]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Example event subscriptions
              </p>
              <div className="mt-4 space-y-2">
                {webhookEvents.map((e) => (
                  <div
                    key={e}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-zinc-900/50 px-4 py-3"
                  >
                    <code className="text-sm text-zinc-200">{e}</code>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
                      webhook
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-sm text-zinc-500">
                Hooks are per-organization and logged — designed for production-grade automations.
              </p>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-950/60 ring-1 ring-white/[0.04]">
              <Image
                src="/marketing/screens/section.png"
                alt="Axiom integrations preview (placeholder)"
                width={1600}
                height={1000}
                sizes="(min-width: 1024px) 560px, 92vw"
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </MarketingReveal>
    </section>
  );
}

