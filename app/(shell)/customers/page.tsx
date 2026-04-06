'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { RouteLoading } from '@/components/RouteLoading';

const Customers = dynamic(
  () => import('@/components/Customers').then((m) => ({ default: m.Customers })),
  {
    loading: () => <RouteLoading label="Müşteriler yükleniyor…" />,
  }
);

export default function CustomersPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('customers');
  }, [setCurrentView]);

  return <Customers />;
}
