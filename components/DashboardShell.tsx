'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionPanel } from '@/components/ActionPanel';
import { AppShellLayout } from '@/components/shell';
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
  '/notifications',
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
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      PREFETCH_APP_ROUTES.forEach((href) => {
        try {
          router.prefetch(href);
        } catch {
          // prefetch isteğe bağlı; bazı ortamlarda sessizce atla
        }
      });
    };
    // Ana işi bloklamadan prefetch: müsait CPU’da veya en geç ~500ms içinde tek seferde.
    let dispose: (() => void) | undefined;
    if (typeof window.requestIdleCallback !== 'undefined') {
      const id = window.requestIdleCallback(run, { timeout: 500 });
      dispose = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(run, 0);
      dispose = () => window.clearTimeout(id);
    }
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [router]);

  return (
    <>
      <AppShellLayout mainClassName="p-4 sm:p-6">{children}</AppShellLayout>
      <TaskEditModalHost />
    </>
  );
}
