'use client';

import { useEffect } from 'react';
import { Achievements } from '@/components/Achievements';
import { useView } from '@/components/ViewContext';

export default function AchievementsPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('achievements');
  }, [setCurrentView]);

  return <Achievements />;
}
