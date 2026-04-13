export function MarketingTrustStrip() {
  const items = ['Next.js', 'TypeScript', 'Supabase', 'NextAuth'] as const;
  return (
    <section className="border-y border-white/[0.06] bg-[#080808] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">
          Built for speed & trust
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-base font-medium tracking-tight text-zinc-200">
          Built for speed with Next.js & Supabase — server-first where it counts, lean JavaScript on first
          paint, and auth patterns your team can trust.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">
          The surface you land on stays light; interactive pieces hydrate as islands. Your production stack
          is the same one powering serious teams.
        </p>
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {items.map((name) => (
            <li
              key={name}
              className="rounded-full border border-white/[0.08] bg-zinc-900/60 px-4 py-2 text-sm font-medium text-zinc-200 backdrop-blur-sm transition-colors hover:border-emerald-500/25 hover:text-white"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
