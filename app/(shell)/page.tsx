'use client';

import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { DailyIntent } from '@/components/DailyIntent';
import { FocusDashboard } from '@/components/FocusDashboard';
import { DashboardInsights } from '@/components/DashboardInsights';

export default function Home() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('dashboard');
  }, [setCurrentView]);

  return (
    <>
      <DailyIntent />
      <FocusDashboard />
      <DashboardInsights />
    </>
  );
}
