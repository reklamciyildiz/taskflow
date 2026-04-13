import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { MarketingUseCasesShowcase } from './MarketingUseCasesShowcase';

export function MarketingUseCases() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">
            Use cases
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl md:text-5xl">
            Built for real days — not just tasks.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-500">
            TaskFlow is a complete operating system for action: capture, process, ship — alone or with a
            team.
          </p>
        </div>

        <MarketingUseCasesShowcase />

        <div className="mt-12 flex justify-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:border-emerald-500/35 hover:bg-emerald-500/15"
          >
            Create your workspace
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </MarketingReveal>
    </section>
  );
}

