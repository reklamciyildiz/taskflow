'use client';

import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { useShellSidebar } from '@/components/shell/sidebar-shell-context';

export interface AppShellLayoutProps {
  children: React.ReactNode;
  /** Ana içerik alanı için ek sınıflar (örn. padding) */
  mainClassName?: string;
}

/**
 * Ortak uygulama iskeleti: Sidebar + Header + scroll edilebilir main.
 * State `SidebarShellProvider` içinden gelir (tek kaynak).
 */
export function AppShellLayout({ children, mainClassName }: AppShellLayoutProps) {
  const { mobileOpen, desktopCollapsed, toggleSidebar, closeMobile } = useShellSidebar();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={closeMobile} desktopCollapsed={desktopCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onSidebarToggle={toggleSidebar} desktopSidebarExpanded={!desktopCollapsed} />
        <main className={cn('flex-1 overflow-auto', mainClassName)}>{children}</main>
      </div>
    </div>
  );
}
