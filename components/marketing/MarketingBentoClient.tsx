'use client';

import { motion } from 'framer-motion';
import { Columns3, Brain, Mic, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

function SecondBrainVisual() {
  return (
    <div className="relative mt-4 h-36 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-950/80 p-2">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent" aria-hidden />
      {[
        { className: 'left-[8%] top-[12%] h-14 w-[42%]', delayClass: '' },
        { className: 'right-[6%] top-[28%] h-11 w-[48%]', delayClass: 'marketing-bento-float-delay-1' },
        { className: 'left-[14%] top-[52%] h-12 w-[55%]', delayClass: 'marketing-bento-float-delay-2' },
        { className: 'right-[12%] bottom-[10%] h-10 w-[40%]', delayClass: 'marketing-bento-float-delay-3' },
      ].map((b, i) => (
        <div
          key={i}
          className={cn(
            'absolute rounded-lg border border-white/10 bg-zinc-900/90 shadow-sm marketing-bento-float',
            b.delayClass,
            b.className
          )}
        />
      ))}
    </div>
  );
}

function ProcessCenterVisual() {
  return (
    <div className="relative mt-4 flex h-36 items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-zinc-950/80 px-4">
      {['Todo', 'Ship', 'Done'].map((label, i) => (
        <div key={label} className="relative z-[1] flex flex-1 flex-col items-center">
          <div
            className={cn(
              'flex h-9 w-full max-w-[4.75rem] items-center justify-center rounded-lg border text-[10px] font-medium uppercase tracking-wider',
              i === 0 && 'border-zinc-600 bg-zinc-900 text-zinc-400',
              i === 1 && 'border-blue-500/40 bg-blue-500/10 text-blue-300',
              i === 2 &&
                'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_20px_-4px_rgba(16,185,129,0.5)]'
            )}
          >
            {label}
          </div>
        </div>
      ))}
      <div
        className="pointer-events-none absolute left-[12%] right-[12%] top-[calc(50%-2px)] h-px bg-gradient-to-r from-zinc-700/40 via-emerald-500/45 to-emerald-400"
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute right-[10%] top-[calc(50%-5px)] h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_2px_rgba(52,211,153,0.75)]"
        animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.2, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
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
