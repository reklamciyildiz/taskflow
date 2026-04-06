'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const Analytics = dynamic(
  () => import('@/components/Analytics').then((m) => ({ default: m.Analytics })),
  {
    loading: () => <RouteLoading label="Analitik yükleniyor…" />,
  }
);

export default function AnalyticsPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('analytics');
  }, [setCurrentView]);

  return <Analytics />;
}
