'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'taskflow-sidebar-desktop-collapsed';

export interface ShellSidebarState {
  mobileOpen: boolean;
  desktopCollapsed: boolean;
  toggleSidebar: () => void;
  closeMobile: () => void;
}

const SidebarShellContext = createContext<ShellSidebarState | null>(null);

export function SidebarShellProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsedState] = useState(false);

  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') {
        setDesktopCollapsedState(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setDesktopCollapsed = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setDesktopCollapsedState((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next;
      try {
        localStorage.setItem(STORAGE_KEY, resolved ? '1' : '0');
      } catch {
        /* ignore */
      }
      return resolved;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setDesktopCollapsed((c) => !c);
    } else {
      setMobileOpen((o) => !o);
    }
  }, [setDesktopCollapsed]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const value = useMemo(
    () => ({
      mobileOpen,
      desktopCollapsed,
      toggleSidebar,
      closeMobile,
    }),
    [mobileOpen, desktopCollapsed, toggleSidebar, closeMobile]
  );

  return <SidebarShellContext.Provider value={value}>{children}</SidebarShellContext.Provider>;
}

export function useShellSidebar(): ShellSidebarState {
  const ctx = useContext(SidebarShellContext);
  if (!ctx) {
    throw new Error('useShellSidebar must be used within SidebarShellProvider');
  }
  return ctx;
}
