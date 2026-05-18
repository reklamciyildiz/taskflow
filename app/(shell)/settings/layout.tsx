'use client';

import { useView } from '@/components/ViewContext';
import { useEffect } from 'react';

// AppShellLayout is already provided by (shell)/layout.tsx via DashboardShell.
// This layout only needs to mark the active view for sidebar highlighting.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('settings');
  }, [setCurrentView]);

  return <>{children}</>;
}
