'use client';

import { AppShellLayout } from '@/components/shell';
import { useView } from '@/components/ViewContext';
import { useEffect } from 'react';

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('profile');
  }, [setCurrentView]);

  return <AppShellLayout>{children}</AppShellLayout>;
}
