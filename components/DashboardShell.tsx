'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { EditTaskModal } from '@/components/EditTaskModal';
import { useTaskContext } from '@/components/TaskContext';

function TaskEditModalHost() {
  const { tasks, editingTaskId, closeTaskEditor } = useTaskContext();
  const task = editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null;
  return (
    <EditTaskModal
      key={editingTaskId ?? 'closed'}
      task={task}
      open={!!editingTaskId}
      onClose={closeTaskEditor}
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
