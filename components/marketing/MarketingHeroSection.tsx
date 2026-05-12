import type { ReactNode } from 'react';
import { MarketingParallaxGlow } from './MarketingParallaxGlow';

/**
 * Hero shell: obsidian surface, film noise, parallax glow (client). SEO-friendly static copy.
 */
export function MarketingHeroSection({ children }: { children: ReactNode }) {
  return (
    <section
      className="relative overflow-hidden border-b border-white/[0.06] bg-[#050505] px-4 pb-24 pt-14 sm:px-6 sm:pt-20 lg:px-10 xl:px-14 2xl:px-16"
      aria-labelledby="marketing-hero-heading"
    >
      <MarketingParallaxGlow />
      <div className="marketing-noise" aria-hidden />
      <div className="relative z-10 mx-auto w-full max-w-[min(88rem,100%)] text-center">
        <h1
          id="marketing-hero-heading"
          className="font-semibold tracking-tighter"
        >
          <span className="marketing-headline-primary block text-[clamp(2.25rem,5vw+0.75rem,5.25rem)] leading-[1.04] sm:leading-[1.03]">
            Quiet the noise.
          </span>
          <span className="marketing-kinetic-line font-semibold tracking-tighter text-[clamp(1.875rem,3.8vw+0.65rem,3.75rem)] leading-[1.06] sm:leading-[1.05]">
            Move to action.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-[min(48rem,100%)] text-base leading-relaxed text-zinc-400 sm:mt-8 sm:text-lg lg:text-xl lg:leading-relaxed">
          Axiom is a personal and team productivity OS — dynamic processes, roles & assignments,
          customer-ready workflows, webhooks to the outside world, and a second brain that keeps context
          attached to real work.
        </p>
      </div>
      <div className="relative z-10">{children}</div>
    </section>
  );
}
