'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionPanel } from '@/components/ActionPanel';
import { AppShellLayout } from '@/components/shell';
import { useTaskContext, type Task } from '@/components/TaskContext';
import { PushSoftAsk } from '@/components/push/PushSoftAsk';


function TaskEditModalHost() {
  const { tasks, editingTaskId, closeTaskEditor } = useTaskContext();
  const [panelTask, setPanelTask] = useState<Task | null>(null);
  const [prevEditingId, setPrevEditingId] = useState<string | null>(null);

  // Sync state during render to avoid 1-frame empty render flashes.
  if (editingTaskId !== prevEditingId) {
    setPrevEditingId(editingTaskId);
    if (editingTaskId) {
      const t = tasks.find((x) => x.id === editingTaskId) ?? null;
      if (t) setPanelTask(t);
    }
  }

  useEffect(() => {
    if (editingTaskId) {
      const t = tasks.find((x) => x.id === editingTaskId) ?? null;
      if (t) setPanelTask(t);
    }
  }, [editingTaskId, tasks]);

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

  // Aggressive manual prefetch loop removed to avoid network congestion and INP issues.
  // Next.js <Link> components in the Sidebar and other UI elements already handle viewport-based prefetching automatically.

  return (
    <>
      <AppShellLayout mainClassName="p-4 sm:p-6">
        <PushSoftAsk />
        {children}
      </AppShellLayout>
      <TaskEditModalHost />
    </>
  );
}
