'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const KnowledgeHubView = dynamic(
  () => import('@/components/KnowledgeHubView').then((m) => ({ default: m.KnowledgeHubView })),
  {
    loading: () => <RouteLoading label="Loading Knowledge Hub…" />,
  }
);

export default function KnowledgeHubPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('knowledge-hub');
  }, [setCurrentView]);

  return <KnowledgeHubView />;
}
