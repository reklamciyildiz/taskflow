import type { ReactNode } from 'react';
import { MarketingParallaxGlow } from './MarketingParallaxGlow';

/**
 * Hero shell: obsidian surface, film noise, parallax glow (client). SEO-friendly static copy.
 */
export function MarketingHeroSection({ children }: { children: ReactNode }) {
  return (
    <section
      className="relative overflow-hidden border-b border-white/[0.06] bg-[#050505] px-4 pb-24 pt-14 sm:px-6 sm:pt-20"
      aria-labelledby="marketing-hero-heading"
    >
      <MarketingParallaxGlow />
      <div className="marketing-noise" aria-hidden />
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <h1
          id="marketing-hero-heading"
          className="marketing-headline-primary text-4xl font-semibold tracking-tighter sm:text-5xl sm:leading-[1.08] lg:text-6xl lg:leading-[1.06]"
        >
          Quiet the noise.
          <span className="marketing-kinetic-line font-semibold tracking-tighter">
            Move to action.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Axiom is a personal and team productivity OS — dynamic processes, roles & assignments,
          customer-ready workflows, webhooks to the outside world, and a second brain that keeps context
          attached to real work.
        </p>
      </div>
      <div className="relative z-10">{children}</div>
    </section>
  );
}
