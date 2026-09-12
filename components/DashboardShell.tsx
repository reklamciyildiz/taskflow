'use client';

import { useState } from 'react';
import { ActionPanel } from '@/components/ActionPanel';
import { AppShellLayout } from '@/components/shell';
import { useTaskContext, type Task } from '@/components/TaskContext';
import { PushSoftAsk } from '@/components/push/PushSoftAsk';


function TaskEditModalHost() {
  const { tasks, editingTaskId, closeTaskEditor } = useTaskContext();
  const [panelTask, setPanelTask] = useState<Task | null>(null);

  // ── Synchronous task lookup ──
  // When editingTaskId becomes truthy, find the task IMMEDIATELY during render
  // so that ActionPanel never receives open=true + task=null (which would
  // cause it to return null and then re-mount, producing a visual flash).
  const isOpen = !!editingTaskId;
  const liveTask = editingTaskId
    ? tasks.find((x) => x.id === editingTaskId) ?? null
    : null;

  // When opening: set panelTask synchronously so ActionPanel has data on the SAME render.
  // When closing: keep the old panelTask alive so the close animation can render content.
  // When tasks update while open: keep panelTask fresh.
  const effectiveTask = isOpen ? (liveTask ?? panelTask) : panelTask;

  // Keep panelTask in sync for the "open" case (covers task data refreshes).
  if (isOpen && liveTask && liveTask !== panelTask) {
    // React allows setState during render when the value actually changed.
    // This avoids the useEffect round-trip that causes the 1-frame null gap.
    setPanelTask(liveTask);
  }

  return (
    <ActionPanel
      task={effectiveTask}
      open={isOpen}
      onClose={closeTaskEditor}
      onExitComplete={() => {
        // Clear the cached task only AFTER the close animation finishes,
        // so the panel can render its content throughout the exit animation.
        if (!editingTaskId) setPanelTask(null);
      }}
    />
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {

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
