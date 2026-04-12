'use client';

import { Suspense } from 'react';
import { AuthProvider } from '@/components/AuthProvider';
import { TaskProvider } from '@/components/TaskContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ViewProvider } from '@/components/ViewContext';
import { SidebarShellProvider } from '@/components/shell';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="todo-theme">
        <TooltipProvider delayDuration={300}>
          <Suspense fallback={null}>
            <TaskProvider>
              <ViewProvider>
                <SidebarShellProvider>
                  {children}
                  <Toaster />
                </SidebarShellProvider>
              </ViewProvider>
            </TaskProvider>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
