'use client';

import { useEffect } from 'react';
import { TaskList } from '@/components/TaskList';
import { useView } from '@/components/ViewContext';

export default function ListPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('list');
  }, [setCurrentView]);

  return <TaskList />;
}
