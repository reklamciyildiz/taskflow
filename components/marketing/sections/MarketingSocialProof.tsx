import { Quote, Sparkles } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';

/**
 * Senior note: We don't claim real logos or named testimonials.
 * These are intentionally marked as "Preview" so we stay truthful until real proof exists.
 */
const quotes = [
  {
    quote:
      'The “capture → checklist → ship” loop finally feels frictionless. It’s the first tool that behaves like an OS, not a form.',
    label: 'Preview feedback',
  },
  {
    quote:
      'Dynamic processes and a Knowledge Hub in the same surface is a killer combo. We stopped losing context between tasks and notes.',
    label: 'Preview feedback',
  },
  {
    quote:
      'The UI is calm, but the system is powerful — board, list, roles, customers, webhooks. It scales without feeling heavy.',
    label: 'Preview feedback',
  },
] as const;

export function MarketingSocialProof() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">
            Social proof
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl md:text-5xl">
            Built to feel inevitable.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-500">
            Until we publish real customer logos and verified reviews, we keep this section honest — and
            focused on the product experience.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {quotes.map((q, i) => (
            <figure
              key={i}
              className={cn(
                'relative overflow-hidden rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6 ring-1 ring-white/[0.04]',
                'transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/25 hover:shadow-[0_0_44px_-18px_rgba(16,185,129,0.18)]'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                  <Quote className="h-5 w-5" aria-hidden />
                </div>
                <figcaption className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {q.label}
                </figcaption>
              </div>
              <blockquote className="mt-4 text-sm leading-relaxed text-zinc-200/90">
                “{q.quote}”
              </blockquote>
              <div
                className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl"
                aria-hidden
              />
            </figure>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-6 ring-1 ring-white/[0.04]">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                <Sparkles className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-zinc-100">
                  Want your team featured here?
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  We’ll replace preview quotes with verified testimonials once your rollout is live.
                </p>
              </div>
            </div>
            <a
              href="/auth/signup"
              className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_26px_-10px_rgba(16,185,129,0.65)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Get started
            </a>
          </div>
        </div>
      </MarketingReveal>
    </section>
  );
}

