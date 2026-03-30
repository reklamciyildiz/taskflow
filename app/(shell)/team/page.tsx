'use client';

import { useEffect } from 'react';
import { TeamMembers } from '@/components/TeamMembers';
import { useView } from '@/components/ViewContext';

export default function TeamPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('team');
  }, [setCurrentView]);

  return <TeamMembers />;
}
