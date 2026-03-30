'use client';

import { DashboardShell } from '@/components/DashboardShell';

/**
 * Shared chrome for main app routes. Keeps Sidebar / Header / task editor host mounted
 * across navigations so client state and trees are not torn down on every page change.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
