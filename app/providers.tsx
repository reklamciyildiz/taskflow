'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ensureServiceWorkerReady } from '@/components/push/push-client';

// TaskProvider, ViewProvider, SidebarShellProvider are only needed inside the
// authenticated app shell — they are mounted by ShellProviders in (shell)/layout.tsx.
// Keeping them out of the root layout prevents their large JS bundles from loading
// on the marketing page and other public routes.
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Offline navigation fallback and Web Push intentionally share one worker.
    // Registration is independent from notification permission so TWA/PWA users
    // are protected after their first successful online load.
    void ensureServiceWorkerReady();
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="todo-theme">
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
