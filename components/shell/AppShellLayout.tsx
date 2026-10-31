'use client';

import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { useShellSidebar } from '@/components/shell/sidebar-shell-context';
import { CapacitorBottomNavigation, useCapacitorMobileNavigation } from '@/components/shell/CapacitorBottomNavigation';

export interface AppShellLayoutProps {
  children: React.ReactNode;
  /** Extra classes for the main content area (e.g. padding) */
  mainClassName?: string;
}

/**
 * Shared app shell: Sidebar + Header + scrollable main.
 * State comes from `SidebarShellProvider` (single source of truth).
 */
export function AppShellLayout({ children, mainClassName }: AppShellLayoutProps) {
  const { mobileOpen, desktopCollapsed, toggleSidebar, closeMobile } = useShellSidebar();
  const showNativeTabs = useCapacitorMobileNavigation();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={closeMobile} desktopCollapsed={desktopCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onSidebarToggle={toggleSidebar} desktopSidebarExpanded={!desktopCollapsed} />
        <main
          className={cn('flex-1 overflow-auto', mainClassName)}
          style={showNativeTabs ? { paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' } : undefined}
        >{children}</main>
      </div>
      {showNativeTabs ? <CapacitorBottomNavigation /> : null}
    </div>
  );
}
