'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const TaskList = dynamic(
  () => import('@/components/TaskList').then((m) => ({ default: m.TaskList })),
  {
    loading: () => <RouteLoading label="Loading list…" />,
  }
);

export default function ListPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('list');
  }, [setCurrentView]);

  return <TaskList />;
}
