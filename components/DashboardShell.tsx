'use client';

import { ActionPanel } from '@/components/ActionPanel';
import { AppShellLayout } from '@/components/shell';
import { useTaskContext } from '@/components/TaskContext';
import { PushSoftAsk } from '@/components/push/PushSoftAsk';


function TaskEditModalHost() {
  const { tasks, editingTaskId, closeTaskEditor } = useTaskContext();

  // Pure derived props — no cached copy, no render-phase setState, no effect round-trip.
  // ActionPanel keeps the exiting subtree alive itself (AnimatePresence renders the last
  // committed element during the exit animation), so `task` may drop to null the same
  // instant `open` does without any visual gap.
  const task = editingTaskId
    ? tasks.find((x) => x.id === editingTaskId) ?? null
    : null;

  return (
    <ActionPanel task={task} open={!!editingTaskId} onClose={closeTaskEditor} />
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
