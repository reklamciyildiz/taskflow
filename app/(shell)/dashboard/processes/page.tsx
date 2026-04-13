'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const ProcessesClient = dynamic(() => import('./ProcessesClient'), {
  loading: () => <RouteLoading label="Loading Process Center…" />,
});

export default function ProcessesPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('processes');
  }, [setCurrentView]);

  return <ProcessesClient />;
}
