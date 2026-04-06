'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ActionPanel } from '@/components/ActionPanel';
import { useTaskContext, type Task } from '@/components/TaskContext';

const PREFETCH_APP_ROUTES = [
  '/',
  '/board',
  '/list',
  '/dashboard/knowledge-hub',
  '/dashboard/processes',
  '/customers',
  '/integrations',
  '/analytics',
  '/achievements',
  '/team',
  '/profile',
  '/settings',
] as const;

function TaskEditModalHost() {
  const { tasks, editingTaskId, closeTaskEditor } = useTaskContext();
  const [panelTask, setPanelTask] = useState<Task | null>(null);

  useEffect(() => {
    if (editingTaskId) {
      const t = tasks.find((x) => x.id === editingTaskId) ?? null;
      if (t) setPanelTask(t);
    }
  }, [editingTaskId, tasks]);

  useEffect(() => {
    if (!editingTaskId) return;
    const t = tasks.find((x) => x.id === editingTaskId);
    if (!t) closeTaskEditor();
  }, [closeTaskEditor, editingTaskId, tasks]);

  return (
    <ActionPanel
      task={panelTask}
      open={!!editingTaskId}
      onClose={closeTaskEditor}
      onExitComplete={() => {
        if (!editingTaskId) setPanelTask(null);
      }}
    />
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      PREFETCH_APP_ROUTES.forEach((href) => {
        try {
          router.prefetch(href);
        } catch {
          // prefetch isteğe bağlı; bazı ortamlarda sessizce atla
        }
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [router]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
      <TaskEditModalHost />
    </div>
  );
}
