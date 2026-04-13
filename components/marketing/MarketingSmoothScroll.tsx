'use client';

import { useEffect } from 'react';

/** Applies smooth scrolling only while the marketing route is mounted. */
export function MarketingSmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('marketing-smooth-scroll');
    return () => root.classList.remove('marketing-smooth-scroll');
  }, []);
  return null;
}
