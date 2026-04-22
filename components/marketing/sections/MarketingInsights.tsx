import { BarChart3, Trophy, Bell, Sparkles } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import { cn } from '@/lib/utils';
import Image from 'next/image';

function MiniBars() {
  const bars = [32, 54, 41, 70, 58, 84, 66] as const;
  return (
    <div className="mt-5 rounded-xl border border-white/[0.06] bg-zinc-950/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Velocity</p>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
          Analytics
        </span>
      </div>
      <div className="mt-4 flex items-end gap-2">
        {bars.map((h, idx) => (
          <div
            key={idx}
            className={cn(
              'w-full rounded-md border border-white/[0.06] bg-zinc-900/60',
              idx === bars.length - 1 && 'bg-emerald-500/15 border-emerald-500/25'
            )}
            style={{ height: `${h}px` }}
            aria-hidden
          />
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-500">
        Track progress across teams and processes — and know what’s moving.
      </p>
    </div>
  );
}

function MiniBadges() {
  const badges = ['Streak', 'Shipped', 'Momentum', 'Focus'] as const;
  return (
    <div className="mt-5 rounded-xl border border-white/[0.06] bg-zinc-950/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Celebrations</p>
        <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-200">
          Achievements
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {badges.map((b) => (
          <span
            key={b}
            className="rounded-full border border-white/[0.08] bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200"
          >
            {b}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-500">
        Small wins matter. Celebrate progress without turning work into noise.
      </p>
    </div>
  );
}

export function MarketingInsights() {
  return (
    <section className="border-t border-white/[0.04] bg-[#050505] px-4 py-24 sm:px-6">
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">
            Insights & momentum
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl md:text-5xl">
            Measure velocity. Celebrate progress.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-500">
            Analytics and achievements make your operating system visible — what’s moving, what’s stuck,
            and what deserves a moment of recognition.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6 ring-1 ring-white/[0.04] transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-16px_rgba(16,185,129,0.22)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                <BarChart3 className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-base font-semibold tracking-tight text-zinc-100">Analytics</p>
                <p className="text-sm text-zinc-500">Status, priority, and throughput signals.</p>
              </div>
            </div>
            <MiniBars />
          </div>

          <div className="rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6 ring-1 ring-white/[0.04] transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-16px_rgba(16,185,129,0.22)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                <Trophy className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-base font-semibold tracking-tight text-zinc-100">Achievements</p>
                <p className="text-sm text-zinc-500">Progress, streaks, and motivation — quietly.</p>
              </div>
            </div>
            <MiniBadges />
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { title: 'Notifications', body: 'Stay aligned with the latest changes and activity.', icon: Bell },
            { title: 'Focus surfaces', body: 'Dashboards that highlight what matters right now.', icon: Sparkles },
          ].map((x) => {
            const Icon = x.icon;
            return (
              <div
                key={x.title}
                className="rounded-2xl border border-white/[0.05] bg-zinc-950/40 p-5 ring-1 ring-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-zinc-100">{x.title}</p>
                    <p className="text-sm text-zinc-500">{x.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-white/[0.06] bg-zinc-950/60 ring-1 ring-white/[0.04]">
          <Image
            src="/marketing/screens/deep-dive.png"
            alt="Axiom analytics preview (placeholder)"
            width={1920}
            height={1080}
            sizes="(min-width: 1024px) 960px, 92vw"
            className="h-auto w-full"
          />
        </div>
      </MarketingReveal>
    </section>
  );
}

