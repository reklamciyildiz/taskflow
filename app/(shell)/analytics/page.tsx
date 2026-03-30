'use client';

import { useEffect } from 'react';
import { Analytics } from '@/components/Analytics';
import { useView } from '@/components/ViewContext';

export default function AnalyticsPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('analytics');
  }, [setCurrentView]);

  return <Analytics />;
}
