import TaskItem from '@tiptap/extension-task-item';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskItemNodeView } from '../components/TaskItemNodeView';
import { v4 as uuidv4 } from 'uuid';

export const AdvancedTaskItem = TaskItem.extend({
  draggable: true,

  addStorage() {
    let completionClock = 0;
    return {
      members: [] as { id: string; name: string }[],
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
