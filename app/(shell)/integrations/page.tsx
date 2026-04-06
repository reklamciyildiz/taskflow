'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const IntegrationsClient = dynamic(() => import('./IntegrationsClient'), {
  loading: () => <RouteLoading label="Entegrasyonlar yükleniyor…" />,
});

export default function IntegrationsPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('integrations');
  }, [setCurrentView]);

  return <IntegrationsClient />;
}
