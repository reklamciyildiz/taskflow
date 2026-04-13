import { MarketingBentoGrid } from './MarketingBentoClient';

export function MarketingBento() {
  return (
    <section id="features" className="scroll-mt-24 border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl md:text-5xl">
          One OS for clarity
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-zinc-500">
          From chaos to clarity — processes, knowledge, and capture in one coherent surface.
        </p>
        <MarketingBentoGrid />
      </div>
    </section>
  );
}
