import TaskItem from '@tiptap/extension-task-item';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskItemNodeView } from '../components/TaskItemNodeView';
import { checklistIdentityPlugin } from './checklistIdentity';

export const AdvancedTaskItem = TaskItem.extend({
  draggable: true,

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), checklistIdentityPlugin()];
  },

  addStorage() {
    let completionClock = 0;
    return {
      members: [] as { id: string; name: string }[],
      taskId: null as string | null,
      checklistMode: false,
      hideDone: false,
      canUseAdvancedReminderPresets: true,
      nextCompletedAt: () => {
        const next = Math.max(Date.now(), completionClock + 1);
        completionClock = next;
        return new Date(next).toISOString();
      },
      onConvertToNote: null,
    };
  },

  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
      },
      id: {
        default: null,
        keepOnSplit: false,
      },
      assigneeId: {
        default: null,
        keepOnSplit: false,
      },
      dueDate: {
        default: null,
        keepOnSplit: false,
      },
      reminders: {
        default: [],
        keepOnSplit: false,
      },
      schedule: {
        default: null,
        keepOnSplit: false,
      },
      completedAt: {
        default: null,
        keepOnSplit: false,
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskItemNodeView);
  },
});
