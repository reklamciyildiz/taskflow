import Image from 'next/image';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';

/**
 * Superlist-style “stage”:
 * One dominant hero screen + a secondary floating screen (overlap) to sell depth.
 */
export function MarketingProductShots() {
  return (
    <section className="bg-[#050505] px-4 pb-10 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-x-10 -top-12 -z-10 h-[70%] rounded-[3rem] bg-emerald-500/[0.06] blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -inset-x-10 -top-16 -z-10 h-[70%] rounded-[3rem] bg-blue-500/[0.04] blur-[120px]"
            aria-hidden
          />

          <div className="relative">
            {/* Main stage */}
            <div
              className={cn(
                'overflow-hidden rounded-3xl border border-white/[0.06] bg-zinc-950/60',
                'ring-1 ring-white/[0.04] shadow-[0_56px_140px_-74px_rgba(0,0,0,0.95)]'
              )}
            >
              <Image
                src="/marketing/screens/hero.png"
                alt="Axiom product preview (placeholder)"
                width={1920}
                height={1080}
                sizes="(min-width: 1024px) 960px, 92vw"
                priority
                className="h-auto w-full"
              />
            </div>

            {/* Floating secondary screen */}
            <div
              className={cn(
                'pointer-events-none absolute -bottom-10 right-4 hidden w-[min(46%,520px)]',
                'overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/70',
                'ring-1 ring-white/[0.05] shadow-[0_40px_120px_-70px_rgba(0,0,0,0.95)]',
                'md:block'
              )}
              aria-hidden
            >
              <Image
                src="/marketing/screens/deep-dive.png"
                alt=""
                width={1400}
                height={900}
                sizes="(min-width: 1024px) 520px, 0px"
                className="h-auto w-full"
              />
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-500">
            Screenshots are placeholders for now — you’ll swap them with real Axiom screens.
          </p>
        </div>
      </MarketingReveal>
    </section>
  );
}

