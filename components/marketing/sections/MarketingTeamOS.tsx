import { Users, ShieldCheck, UserCheck } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';

const items = [
  {
    title: 'Multi-team collaboration',
    body: 'Switch teams, keep context, and run multiple workstreams without losing focus.',
    icon: Users,
  },
  {
    title: 'Roles & permissions',
    body: 'Admin and member roles with capability-based controls (edit, delete, assign, complete).',
    icon: ShieldCheck,
  },
  {
    title: 'Assignments that stick',
    body: 'Ownership is explicit — tasks can be assigned, tracked, and completed by the right people.',
    icon: UserCheck,
  },
] as const;

export function MarketingTeamOS() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">
            The Team OS
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl md:text-5xl">
            Personal for you, powerful for teams.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-500">
            Axiom keeps the “personal OS” feel — while still behaving like a real team system: roles,
            permissions, assignments, and shared visibility.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.title}
                className={cn(
                  'rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6',
                  'ring-1 ring-white/[0.04]',
                  'transition-[border-color,box-shadow] duration-300',
                  'hover:border-emerald-500/30 hover:shadow-[0_0_40px_-16px_rgba(16,185,129,0.25)]'
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-zinc-100">{it.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{it.body}</p>
              </div>
            );
          })}
        </div>
      </MarketingReveal>
    </section>
  );
}

