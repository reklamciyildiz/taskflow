'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketingDemoCard } from '@/lib/marketing-demo-storage';

export type { MarketingDemoCard, MarketingDemoCheckItem } from '@/lib/marketing-demo-storage';

const springEnter = { type: 'spring' as const, stiffness: 300, damping: 20 };

type DemoActionDeckProps = {
  cards: MarketingDemoCard[];
  onToggleItem: (cardId: string, itemId: string) => void;
};

function ChecklistRow({
  item,
  cardId,
  onToggle,
  onCheckAnimate,
}: {
  item: MarketingDemoCard['items'][0];
  cardId: string;
  onToggle: (cardId: string, itemId: string) => void;
  onCheckAnimate: (cardId: string) => void;
}) {
  const reduce = useReducedMotion();

  const handleClick = () => {
    if (!item.done) onCheckAnimate(cardId);
    onToggle(cardId, item.id);
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3.5 text-left text-sm transition-colors',
          'hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
          item.done && 'text-zinc-500'
        )}
      >
        <motion.span
          layout
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
            item.done
              ? 'border-emerald-500/80 bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]'
              : 'border-zinc-600 bg-zinc-950/80'
          )}
          aria-hidden
          whileTap={reduce ? undefined : { scale: 0.92 }}
        >
          <AnimatePresence mode="wait">
            {item.done ? (
              <motion.span
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.span>
        <span className="relative inline-block flex-1 pt-0.5 text-zinc-200">
          <motion.span
            animate={{ opacity: item.done ? 0.75 : 1 }}
            className="inline-block"
          >
            {item.text}
          </motion.span>
          <motion.span
            aria-hidden
            className="absolute left-0 top-[52%] h-[2px] w-full origin-left rounded-full bg-emerald-500/70"
            initial={false}
            animate={{ scaleX: item.done ? 1 : 0 }}
            transition={
              reduce
                ? { duration: 0.15 }
                : { type: 'spring', stiffness: 380, damping: 30 }
            }
            style={{ transformOrigin: '0% 50%' }}
          />
        </span>
      </button>
    </li>
  );
}

export function DemoActionDeck({ cards, onToggleItem }: DemoActionDeckProps) {
  const reduce = useReducedMotion();
  const [shakeCardId, setShakeCardId] = useState<string | null>(null);

  const triggerShake = useCallback((cardId: string) => {
    if (reduce) return;
    setShakeCardId(cardId);
    window.setTimeout(() => setShakeCardId(null), 420);
  }, [reduce]);

  if (cards.length === 0) {
    return (
      <p className="mx-auto max-w-xl px-4 text-center text-sm leading-relaxed text-zinc-500">
        Try the magnet above — an action card drops in with real weight. This is a{' '}
        <span className="text-zinc-300">local simulation</span>; nothing hits the server. Progress can
        persist in this browser after refresh.
      </p>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4">
      <AnimatePresence mode="popLayout">
        {cards.map((card) => (
          <motion.article
            key={card.id}
            layout
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={springEnter}
            className={cn(
              'overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]',
              'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
              'ring-1 ring-emerald-500/[0.07]'
            )}
          >
            <motion.div
              animate={
                shakeCardId === card.id && !reduce
                  ? { x: [0, -5, 5, -4, 4, -2, 0] }
                  : { x: 0 }
              }
              transition={{ duration: 0.38, ease: 'easeOut' }}
            >
              <div className="border-b border-white/[0.06] bg-gradient-to-r from-zinc-900/90 to-zinc-900/50 px-4 py-3.5">
                <h3 className="font-medium leading-snug tracking-tight text-zinc-100">{card.title}</h3>
              </div>
              <ul className="divide-y divide-white/[0.05]">
                {card.items.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    cardId={card.id}
                    onToggle={onToggleItem}
                    onCheckAnimate={triggerShake}
                  />
                ))}
              </ul>
            </motion.div>
          </motion.article>
        ))}
      </AnimatePresence>
    </div>
  );
}
