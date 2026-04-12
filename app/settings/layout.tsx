'use client';

import { AppShellLayout } from '@/components/shell';
import { useView } from '@/components/ViewContext';
import { useEffect } from 'react';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('settings');
  }, [setCurrentView]);

  return <AppShellLayout>{children}</AppShellLayout>;
}
