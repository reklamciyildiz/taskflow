'use client';

import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { PlannerV2 } from '@/components/planner/PlannerV2';

export default function PlannerPage() {
  const { setCurrentView } = useView();
  useEffect(() => setCurrentView('planner'), [setCurrentView]);
  return <PlannerV2 />;
}
