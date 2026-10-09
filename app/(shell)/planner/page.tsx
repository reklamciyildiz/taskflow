'use client';

import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { PlannerToday } from '@/components/PlannerToday';

export default function PlannerPage() {
  const { setCurrentView } = useView();
  useEffect(() => setCurrentView('planner'), [setCurrentView]);
  return <PlannerToday />;
}
