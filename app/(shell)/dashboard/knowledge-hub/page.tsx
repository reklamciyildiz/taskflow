'use client';

import { useEffect } from 'react';
import { KnowledgeHubView } from '@/components/KnowledgeHubView';
import { useView } from '@/components/ViewContext';

export default function KnowledgeHubPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('knowledge-hub');
  }, [setCurrentView]);

  return <KnowledgeHubView />;
}
