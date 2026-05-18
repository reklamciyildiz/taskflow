'use client';

import { DashboardShell } from '@/components/DashboardShell';
import { ShellProviders } from '@/components/ShellProviders';

/**
 * Shared chrome for main app routes. Keeps Sidebar / Header / task editor host mounted
 * across navigations so client state and trees are not torn down on every page change.
 * ShellProviders scopes TaskContext (and its API calls) to this layout only — public
 * routes (marketing, auth) don't pay the cost of loading it.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShellProviders>
      <DashboardShell>{children}</DashboardShell>
    </ShellProviders>
  );
}
