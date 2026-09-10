import TaskItem from '@tiptap/extension-task-item';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskItemNodeView } from '../components/TaskItemNodeView';
import { v4 as uuidv4 } from 'uuid';

export const AdvancedTaskItem = TaskItem.extend({
  name: 'advancedTaskItem',

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
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskItemNodeView);
  },
});

