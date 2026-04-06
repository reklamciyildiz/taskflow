'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const TeamMembers = dynamic(
  () => import('@/components/TeamMembers').then((m) => ({ default: m.TeamMembers })),
  {
    loading: () => <RouteLoading label="Takım yükleniyor…" />,
  }
);

export default function TeamPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('team');
  }, [setCurrentView]);

  return <TeamMembers />;
}
