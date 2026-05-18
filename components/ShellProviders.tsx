'use client';

import { Suspense } from 'react';
import { TaskProvider } from '@/components/TaskContext';
import { ViewProvider } from '@/components/ViewContext';
import { SidebarShellProvider } from '@/components/shell';

/**
 * Providers required only inside the authenticated app shell.
 * Mounted by (shell)/layout.tsx so they never load on public routes (marketing, auth, onboarding).
 */
export function ShellProviders({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <TaskProvider>
        <ViewProvider>
          <SidebarShellProvider>
            {children}
          </SidebarShellProvider>
        </ViewProvider>
      </TaskProvider>
    </Suspense>
  );
}
