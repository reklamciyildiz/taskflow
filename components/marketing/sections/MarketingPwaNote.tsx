import { Smartphone, Download } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';

export function MarketingPwaNote() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-16 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/25 p-6 ring-1 ring-white/[0.04]">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                <Smartphone className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-zinc-100">
                  PWA & portability
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                  Installable on any device for a native-like experience — lightweight, fast, and always
                  within reach.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">
              <Download className="h-4 w-4" aria-hidden />
              Installable (PWA)
            </div>
          </div>
        </div>
      </MarketingReveal>
    </section>
  );
}

