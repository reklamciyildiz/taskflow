'use client';

import { useEffect } from 'react';
import { Customers } from '@/components/Customers';
import { useView } from '@/components/ViewContext';

export default function CustomersPage() {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('customers');
  }, [setCurrentView]);

  return <Customers />;
}
