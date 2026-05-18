'use client';

import { useView } from '@/components/ViewContext';
import { useEffect } from 'react';

// AppShellLayout is already provided by (shell)/layout.tsx via DashboardShell.
// This layout only needs to mark the active view for sidebar highlighting.
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const { setCurrentView } = useView();

  useEffect(() => {
    setCurrentView('profile');
  }, [setCurrentView]);

  return <>{children}</>;
}
