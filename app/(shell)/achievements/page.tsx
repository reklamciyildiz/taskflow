'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const Achievements = dynamic(
  () => import('@/components/Achievements').then((m) => ({ default: m.Achievements })),
  {
    loading: () => <RouteLoading label="Loading achievements…" />,
  }
);

export default function AchievementsPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('achievements');
  }, [setCurrentView]);

  return <Achievements />;
}
