'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const TaskBoard = dynamic(
  () => import('@/components/TaskBoard').then((m) => ({ default: m.TaskBoard })),
  {
    ssr: false,
    loading: () => <RouteLoading label="Loading board…" />,
  }
);

export default function BoardPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('board');
  }, [setCurrentView]);

  return <TaskBoard />;
}
