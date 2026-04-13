'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutList } from 'lucide-react';
import { DemoQuickCapture } from './DemoQuickCapture';
import { MarketingConfetti } from './MarketingConfetti';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  MARKETING_DEMO_STORAGE_KEY,
  parseMarketingDemoCards,
  stringifyMarketingDemoCards,
  type MarketingDemoCard,
  type MarketingDemoCheckItem,
} from '@/lib/marketing-demo-storage';

const DemoActionDeck = dynamic(
  () => import('./DemoActionDeck').then((m) => m.DemoActionDeck),
  {
    ssr: false,
    loading: () => (
      <div
        className="mx-auto min-h-[120px] w-full max-w-2xl rounded-2xl border border-white/[0.06] bg-zinc-900/30 px-4 py-8"
        aria-hidden
      >
        <div className="mx-auto h-4 max-w-md animate-pulse rounded bg-zinc-800/80" />
        <div className="mx-auto mt-4 h-24 max-w-lg animate-pulse rounded-xl bg-zinc-800/50" />
      </div>
    ),
  }
);

const MAX_DEMO_CARDS = 4;

function newId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultChecklist(): MarketingDemoCheckItem[] {
  return [
    { id: newId('i'), text: 'Break it into the next concrete step', done: false },
    { id: newId('i'), text: 'Schedule or assign an owner', done: false },
    { id: newId('i'), text: 'Ship the smallest useful version', done: false },
  ];
}

export function MarketingHeroInteractive() {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [cards, setCards] = useState<MarketingDemoCard[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const prevCheckedRef = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MARKETING_DEMO_STORAGE_KEY);
      const parsed = parseMarketingDemoCards(raw);
      if (parsed?.length) setCards(parsed);
    } catch {
      /* ignore */
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady || typeof window === 'undefined') return;
    try {
      localStorage.setItem(MARKETING_DEMO_STORAGE_KEY, stringifyMarketingDemoCards(cards));
    } catch {
      /* quota / private mode */
    }
  }, [cards, storageReady]);

  const onCapture = useCallback((title: string) => {
    setCards((prev) =>
      [
        {
          id: newId('c'),
          title,
          items: defaultChecklist(),
        },
        ...prev,
      ].slice(0, MAX_DEMO_CARDS)
    );
  }, []);

  const onToggleItem = useCallback((cardId: string, itemId: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id !== cardId
          ? c
          : {
              ...c,
              items: c.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
            }
      )
    );
  }, []);

  const checkedCount = useMemo(
    () => cards.reduce((acc, c) => acc + c.items.filter((i) => i.done).length, 0),
    [cards]
  );

  const showJoinCta = checkedCount >= 3;

  useEffect(() => {
    if (checkedCount >= 3 && prevCheckedRef.current < 3) {
      setConfettiBurst((n) => n + 1);
    }
    prevCheckedRef.current = checkedCount;
  }, [checkedCount]);

  const deck = (
    <DemoActionDeck cards={cards} onToggleItem={onToggleItem} />
  );

  const clearDemo = useCallback(() => {
    setCards([]);
    setDrawerOpen(false);
    prevCheckedRef.current = 0;
    try {
      localStorage.removeItem(MARKETING_DEMO_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="relative mt-12">
      <MarketingConfetti burstKey={confettiBurst} />

      <AnimatePresence>
        {showJoinCta && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute -inset-x-4 -top-8 bottom-0 -z-10 sm:-inset-x-10"
            aria-hidden
          >
            <div className="absolute inset-0 rounded-[2.5rem] bg-emerald-500/[0.08] blur-3xl" />
            <div className="absolute inset-0 rounded-[2.5rem] bg-blue-500/[0.05] blur-[100px]" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-6xl">
        <DemoQuickCapture onCapture={onCapture} />
      </div>

      {cards.length > 0 ? (
        <div className="mx-auto mt-4 flex max-w-2xl justify-end px-4">
          <button
            type="button"
            onClick={clearDemo}
            className="text-xs font-medium text-zinc-500 transition-colors hover:text-emerald-300"
          >
            Clear demo
          </button>
        </div>
      ) : null}

      {isMd ? (
        <div className="mx-auto mt-10 min-h-[120px]">{deck}</div>
      ) : cards.length === 0 ? (
        <div className="mx-auto mt-10 min-h-[100px]">{deck}</div>
      ) : (
        <div className="mx-auto mt-8">
          <p className="mb-3 text-center text-xs text-zinc-500">
            {cards.length} action card{cards.length !== 1 ? 's' : ''} in your demo — open the tray to review
            and check items.
          </p>
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="mx-auto flex h-12 w-full max-w-md items-center justify-center gap-2 border-emerald-500/25 bg-zinc-900/50 text-zinc-100 shadow-[0_0_24px_-8px_rgba(16,185,129,0.35)] hover:bg-zinc-900/80 hover:text-white"
              >
                <LayoutList className="h-4 w-4 text-emerald-400" aria-hidden />
                Open demo board
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  {cards.length}
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="h-[min(88vh,640px)] border-white/10 bg-[#0a0a0a] px-4 pb-8 pt-6"
            >
              <SheetHeader className="mb-4 text-left">
                <SheetTitle className="text-lg text-zinc-100">Your demo actions</SheetTitle>
              </SheetHeader>
              <div className="max-h-[calc(100%-4rem)] overflow-y-auto pr-1">{deck}</div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      <AnimatePresence>
        {showJoinCta && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="mx-auto mt-12 max-w-lg px-4"
          >
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/35 bg-gradient-to-b from-emerald-500/15 to-zinc-900/80 px-6 py-5 text-center shadow-[0_0_40px_-12px_rgba(16,185,129,0.45)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.2),transparent_55%)]" />
              <p className="relative text-base font-semibold tracking-tight text-zinc-50">
                You just proved the loop.
              </p>
              <p className="relative mt-1 text-sm text-zinc-400">
                Ready to run every action in one workspace? This demo stays in your browser until you clear
                site data.
              </p>
              <Link
                href="/auth/signup"
                className="relative mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-8 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Get started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
