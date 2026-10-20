'use client';

import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { DashboardV2 } from '@/components/dashboard/DashboardV2';

export default function Home() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('dashboard');
  }, [setCurrentView]);

  return <DashboardV2 />;
}
