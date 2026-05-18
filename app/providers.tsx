'use client';

import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

// TaskProvider, ViewProvider, SidebarShellProvider are only needed inside the
// authenticated app shell — they are mounted by ShellProviders in (shell)/layout.tsx.
// Keeping them out of the root layout prevents their large JS bundles from loading
// on the marketing page and other public routes.
export function Providers({ children }: { children: React.ReactNode }) {
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
