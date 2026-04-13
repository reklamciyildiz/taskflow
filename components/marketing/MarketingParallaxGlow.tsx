'use client';

import {
  useMotionValue,
  useSpring,
  motion,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { useEffect } from 'react';

/**
 * Large subtle emerald/blue radial glow that gently follows the pointer.
 */
export function MarketingParallaxGlow() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.18);
  const sx = useSpring(mx, { stiffness: 28, damping: 24, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 28, damping: 24, mass: 0.6 });
  const left = useTransform(sx, (v) => `${v * 100}%`);
  const top = useTransform(sy, (v) => `${v * 55 + 5}%`);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      mx.set(Math.min(1, Math.max(0, x)));
      my.set(Math.min(1, Math.max(0, y)));
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [mx, my, reduce]);

  if (reduce) {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 85% 55% at 50% 15%, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.08) 35%, transparent 65%)',
        }}
        aria-hidden
      />
    );
  }

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <motion.div
        className="absolute h-[min(140vw,900px)] w-[min(140vw,900px)] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          left,
          top,
          background:
            'radial-gradient(circle at center, rgba(16, 185, 129, 0.22) 0%, rgba(59, 130, 246, 0.12) 38%, transparent 68%)',
        }}
      />
    </motion.div>
  );
}
