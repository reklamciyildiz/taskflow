'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ActionPanel } from '@/components/ActionPanel';
import { useTaskContext, type Task } from '@/components/TaskContext';

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

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
      <TaskEditModalHost />
    </div>
  );
}
