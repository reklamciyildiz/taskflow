'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type MarketingRevealProps = {
  children: React.ReactNode;
  className?: string;
  /** IntersectionObserver threshold */
  threshold?: number;
};

/** Minimal scroll-reveal: fades in once when it enters viewport. */
export function MarketingReveal({
  children,
  className,
  threshold = 0.18,
}: MarketingRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, visible]);

  return (
    <div
      ref={ref}
      className={cn('marketing-reveal', className)}
      data-visible={visible ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}

