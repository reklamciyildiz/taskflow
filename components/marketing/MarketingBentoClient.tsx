'use client';

import { motion } from 'framer-motion';
import { Columns3, Brain, Mic, ListChecks, Search, Tag, CalendarDays, User } from 'lucide-react';
import { cn } from '@/lib/utils';

function SecondBrainVisual() {
  return (
    <div className="relative mt-4 h-36 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-950/80 p-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(16,185,129,0.16),transparent_55%)]" aria-hidden />
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-zinc-900/50 px-2.5 py-2">
        <Search className="h-4 w-4 text-zinc-500" aria-hidden />
        <div className="h-2 w-24 rounded bg-zinc-700/60" aria-hidden />
        <span className="ml-auto rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200">
          Knowledge Hub
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        {[
          { title: 'Action: onboarding polish', tag: 'learnings', glow: 'marketing-bento-float' },
          { title: 'Process: Sales handoff', tag: 'playbook', glow: 'marketing-bento-float-delay-1' },
          { title: 'Customer: Acme rollout', tag: 'customer', glow: 'marketing-bento-float-delay-2' },
        ].map((x) => (
          <div
            key={x.title}
            className={cn(
              'rounded-lg border border-white/[0.06] bg-zinc-900/40 px-3 py-2 shadow-sm',
              x.glow
            )}
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" aria-hidden />
              <p className="truncate text-[11px] font-medium text-zinc-200">{x.title}</p>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-zinc-950/50 px-2 py-0.5 text-[10px] text-zinc-400">
                <Tag className="h-3 w-3" aria-hidden />
                {x.tag}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" aria-hidden />
                Workspace
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" aria-hidden />
                Saved today
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessCenterVisual() {
  return (
    <div className="relative mt-4 h-36 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-950/80 p-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_0%,rgba(59,130,246,0.14),transparent_55%)]" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Process Center</div>
        <span className="rounded-full border border-white/[0.08] bg-zinc-950/60 px-2 py-0.5 text-[10px] text-zinc-400">
          Workspace pipeline
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Todo', accent: 'zinc', items: 2 },
          { label: 'Ship', accent: 'blue', items: 2 },
          { label: 'Done', accent: 'emerald', items: 1 },
        ].map((col) => (
          <div key={col.label} className="min-w-0">
            <div
              className={cn(
                'flex items-center justify-between rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider',
                col.accent === 'zinc' && 'border-white/[0.08] bg-zinc-900/50 text-zinc-400',
                col.accent === 'blue' && 'border-blue-500/25 bg-blue-500/10 text-blue-200',
                col.accent === 'emerald' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              )}
            >
              <span>{col.label}</span>
              <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] text-zinc-300">{col.items}</span>
            </div>

            <div className="mt-2 space-y-2">
              {col.label === 'Todo' ? (
                <>
                  <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 px-2 py-2">
                    <div className="h-2 w-[78%] rounded bg-zinc-700/60" aria-hidden />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded border border-white/[0.08] bg-zinc-950/50 px-1.5 py-0.5 text-[9px] text-zinc-400">
                        P2
                      </span>
                      <span className="h-4 w-4 rounded-full bg-zinc-700/60" aria-hidden />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 px-2 py-2">
                    <div className="h-2 w-[62%] rounded bg-zinc-700/60" aria-hidden />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded border border-white/[0.08] bg-zinc-950/50 px-1.5 py-0.5 text-[9px] text-zinc-400">
                        P3
                      </span>
                      <span className="h-4 w-4 rounded-full bg-zinc-700/60" aria-hidden />
                    </div>
                  </div>
                </>
              ) : col.label === 'Ship' ? (
                <>
                  <div className="rounded-lg border border-blue-500/15 bg-blue-500/5 px-2 py-2 shadow-[0_0_22px_-14px_rgba(59,130,246,0.45)]">
                    <div className="h-2 w-[84%] rounded bg-blue-300/20" aria-hidden />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-200">
                        Due today
                      </span>
                      <span className="h-4 w-4 rounded-full bg-blue-300/20" aria-hidden />
                    </div>
                  </div>
                  <div className="rounded-lg border border-blue-500/15 bg-blue-500/5 px-2 py-2">
                    <div className="h-2 w-[68%] rounded bg-blue-300/20" aria-hidden />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-200">
                        Assigned
                      </span>
                      <span className="h-4 w-4 rounded-full bg-blue-300/20" aria-hidden />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-2 py-2 shadow-[0_0_26px_-14px_rgba(16,185,129,0.45)]">
                  <div className="h-2 w-[72%] rounded bg-emerald-300/20" aria-hidden />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-200">
                      Done
                    </span>
                    <motion.div
                      className="h-4 w-4 rounded-full bg-emerald-300/25"
                      animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      aria-hidden
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceVisual() {
  return (
    <div className="relative mt-4 flex h-36 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80">
      <motion.div
        className="absolute rounded-full bg-emerald-500/20"
        animate={{ scale: [1, 1.6, 1], opacity: [0.35, 0, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
        style={{ width: 72, height: 72 }}
        aria-hidden
      />
      <motion.div
        className="absolute rounded-full border border-emerald-500/30 bg-emerald-500/10"
        animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.15, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 0.2 }}
        style={{ width: 56, height: 56 }}
        aria-hidden
      />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/40 bg-zinc-900 text-emerald-400 shadow-[0_0_24px_-4px_rgba(16,185,129,0.55)]">
        <Mic className="h-6 w-6" aria-hidden />
      </div>
    </div>
  );
}

function ChecklistVisual() {
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-zinc-950/80 p-3">
      {['Capture', 'Break down', 'Ship'].map((t, i) => (
        <div key={t} className="flex items-center gap-2 text-xs text-zinc-400">
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border',
              i < 2 ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-400' : 'border-zinc-600'
            )}
          >
            {i < 2 ? '✓' : ''}
          </span>
          <span className={i < 2 ? 'text-zinc-500 line-through' : 'text-zinc-300'}>{t}</span>
        </div>
      ))}
    </div>
  );
}

const cells = [
  {
    title: 'Process Center',
    body: 'Define your own pipeline — columns, stages, and a clear finish line. Same board, your rules.',
    icon: Columns3,
    visual: <ProcessCenterVisual />,
    className: 'md:col-span-2 md:row-span-1',
  },
  {
    title: 'Second brain',
    body: 'Learnings and journal entries tied to real work — searchable across everything you captured.',
    icon: Brain,
    visual: <SecondBrainVisual />,
    className: 'md:col-span-1 md:row-span-2',
  },
  {
    title: 'Action checklist',
    body: 'Keep-style lines inside each action — check off steps without fighting a form.',
    icon: ListChecks,
    visual: <ChecklistVisual />,
    className: 'md:col-span-1',
  },
  {
    title: 'Voice to action',
    body: 'Speak an action into existence when typing is too slow. Built for momentum.',
    icon: Mic,
    visual: <VoiceVisual />,
    className: 'md:col-span-1',
  },
];

export function MarketingBentoGrid() {
  return (
    <div className="mt-12 grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2">
      {cells.map((cell, index) => {
        const Icon = cell.icon;
        return (
          <div
            key={cell.title}
            style={{ animationDelay: `${index * 75}ms` }}
            className={cn(
              'group flex flex-col rounded-2xl border border-white/[0.05] bg-zinc-900/30 p-6 opacity-0 shadow-sm',
              'transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-16px_rgba(16,185,129,0.25)]',
              'animate-marketing-rise ring-1 ring-white/[0.04]',
              cell.className
            )}
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400/90 shadow-inner">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-100">{cell.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{cell.body}</p>
            {cell.visual}
          </div>
        );
      })}
    </div>
  );
}
