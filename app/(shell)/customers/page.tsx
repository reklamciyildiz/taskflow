'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';
import { useTaskContext } from '@/components/TaskContext';

function CustomersPageLoading() {
  const { customerDirectoryLabel } = useTaskContext();
  return <RouteLoading label={`Loading ${customerDirectoryLabel}…`} />;
}

const Customers = dynamic(
  () => import('@/components/Customers').then((m) => ({ default: m.Customers })),
  {
    loading: () => <CustomersPageLoading />,
  }
);

export default function CustomersPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('customers');
  }, [setCurrentView]);

  return <Customers />;
}
