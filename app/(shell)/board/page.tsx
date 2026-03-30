'use client';

import { useEffect } from 'react';
import { TaskBoard } from '@/components/TaskBoard';
import { useView } from '@/components/ViewContext';

export default function BoardPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('board');
  }, [setCurrentView]);

  return <TaskBoard />;
}
