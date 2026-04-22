'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { CalendarDays, Briefcase, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

type UseCaseKey = 'day' | 'work' | 'home';

const cases: Record<
  UseCaseKey,
  {
    title: string;
    body: string;
    icon: LucideIcon;
    shotSrc: string;
  }
> = {
  day: {
    title: 'Plan your day',
    body: 'Capture fast, turn thoughts into actions, and keep today’s intent visible across your OS.',
    icon: CalendarDays,
    shotSrc: '/marketing/screens/use-cases.png',
  },
  work: {
    title: 'Stay on top of work',
    body: 'Run projects with dynamic pipelines, assignments, and shared visibility — board + list in sync.',
    icon: Briefcase,
    shotSrc: '/marketing/screens/features-grid.png',
  },
  home: {
    title: 'Keep personal workflows in sync',
    body: 'Use Axiom as a personal OS: checklists, learnings, and a second brain tied to what you do.',
    icon: Home,
    shotSrc: '/marketing/screens/section.png',
  },
};

const order: UseCaseKey[] = ['day', 'work', 'home'];

export function MarketingUseCasesShowcase() {
  const [active, setActive] = useState<UseCaseKey>('day');
  const activeCase = cases[active];

  const buttons = useMemo(
    () =>
      order.map((k) => {
        const c = cases[k];
        const Icon = c.icon;
        const isActive = k === active;
        return (
          <button
            key={k}
            type="button"
            onClick={() => setActive(k)}
            className={cn(
              'group flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors',
              isActive
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-white/[0.06] bg-zinc-950/40 hover:bg-white/[0.03]'
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border bg-zinc-950/80 shadow-inner',
                isActive ? 'border-emerald-500/25 text-emerald-400' : 'border-white/[0.06] text-zinc-400'
              )}
              aria-hidden
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-zinc-100">
                {c.title}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-zinc-500">{c.body}</span>
            </span>
          </button>
        );
      }),
    [active]
  );

  return (
    <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center">
      <div className="space-y-3">{buttons}</div>

      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-emerald-500/[0.07] blur-3xl" aria-hidden />
        <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-zinc-950/60 ring-1 ring-white/[0.04] shadow-[0_48px_120px_-72px_rgba(0,0,0,0.95)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            >
              <Image
                src={activeCase.shotSrc}
                alt={`Axiom ${activeCase.title} preview (placeholder)`}
                width={1600}
                height={1000}
                sizes="(min-width: 1024px) 560px, 92vw"
                className="h-auto w-full"
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

