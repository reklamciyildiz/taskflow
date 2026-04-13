'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

type MarketingConfettiProps = {
  /** Increment to trigger a new burst */
  burstKey: number;
};

export function MarketingConfetti({ burstKey }: MarketingConfettiProps) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: reduce ? 0 : 22 }, (_, i) => ({
        id: `${burstKey}-${i}`,
        x: 42 + (Math.sin(i * 1.7) * 28 + (i % 5) * 6),
        delay: i * 0.02,
        duration: 1.35 + (i % 4) * 0.12,
        rotate: (i * 47) % 360,
        hue: i % 2 === 0 ? 'emerald' : 'blue',
      })),
    [burstKey, reduce]
  );

  if (reduce || burstKey === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      <AnimatePresence>
        {pieces.map((p, i) => (
          <motion.span
            key={p.id}
            initial={{ opacity: 0.95, y: '72vh', x: `${p.x}vw`, scale: 0.6, rotate: 0 }}
            animate={{
              opacity: 0,
              y: '-8vh',
              x: `${p.x + ((i % 9) - 4) * 1.8}vw`,
              scale: 1,
              rotate: p.rotate,
            }}
            transition={{ duration: p.duration, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
            className={
              p.hue === 'emerald'
                ? 'absolute h-1.5 w-2 rounded-[2px] bg-emerald-400/90 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                : 'absolute h-1.5 w-2 rounded-[2px] bg-blue-400/90 shadow-[0_0_12px_rgba(96,165,250,0.55)]'
            }
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
