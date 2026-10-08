import React, { forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import { AdvancedTaskItem } from './extensions/AdvancedTaskItem';
import { Button } from '@/components/ui/button';
import { CheckSquare, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { NoteType } from '@/lib/types';

export interface ChecklistNoteConversionRequest {
  taskItemId: string;
  text: string;
  type: NoteType;
  removeAfter: boolean;
}

export interface BlockEditorRef {
  /**
   * Insert TipTap JSON (node or node array) or an HTML/text string at the end of the
   * document. When the document is still empty the content replaces the placeholder
   * paragraph instead of being appended below it.
   */
  insertContent: (content: any) => void;
  focus: () => void;
  appendTaskItem: (text: string) => boolean;
  replaceContent: (content: any) => void;
  removeTaskItem: (taskItemId: string) => boolean;
}

interface BlockEditorProps {
  initialContent?: any;
  /** Document used when `initialContent` is empty (e.g. start a checklist as a task list). */
  emptyContent?: any;
  onChange?: (content: any) => void;
  placeholder?: string;
  /** Show one placeholder only while the whole document is empty. */
  documentPlaceholder?: boolean;
  className?: string;
  /** Team member list — passed via storage to TaskItemNodeView to avoid context re-renders */
  members?: { id: string; name: string }[];
  /** Hide the "Checkboxes / Plain text" toolbar. */
  hideToolbar?: boolean;
  checklistMode?: boolean;
  hideDone?: boolean;
  canUseAdvancedReminderPresets?: boolean;
  onConvertTaskItemToNote?: (
    request: ChecklistNoteConversionRequest,
  ) => Promise<boolean>;
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export const BlockEditor = forwardRef<BlockEditorRef, BlockEditorProps>(
  (
    {
      initialContent,
      emptyContent,
      onChange,
      placeholder = 'Write something...',
      documentPlaceholder = false,
      className,
      members,
      hideToolbar = false,
      checklistMode = false,
      hideDone = false,
      canUseAdvancedReminderPresets = true,
      onConvertTaskItemToNote,
    },
    ref,
  ) => {
  const editor = useEditor({
    // This editor only ever mounts client-side after a user interaction (never during SSR/hydration).
    // Without this, @tiptap/react defaults to `false` under Next.js, returns `null` on the first
    // render, and the host panel paints once without the editor and once with it → visible flash.
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      TaskList,
      AdvancedTaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: ({ editor }) =>
          documentPlaceholder && !editor.isEmpty ? '' : placeholder,
        // Checklists are `taskList > taskItem > paragraph`; without this the empty
        // paragraph inside the first task item never gets the placeholder decoration.
        // Document-style notes instead show a single placeholder only when fully empty.
        includeChildren: !documentPlaceholder,
      }),
    ],
    content: initialContent || emptyContent || EMPTY_DOC,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        // Kill default list indentations and margin via prose-ul:pl-0 prose-li:my-0
        class: 'focus:outline-none min-h-[120px] prose dark:prose-invert max-w-none text-sm prose-ul:pl-0 prose-ul:my-0 prose-li:my-0 prose-li:pl-0 marker:text-transparent',
      },
    },
  });

  // Sync checklist UI context into editor storage so TaskItemNodeView can read it
  // without subscribing to the global TaskContext (which would re-render
  // every row on any tasks array change, causing visible jitter).
  React.useEffect(() => {
    if (editor) {
      const storage = editor.storage as any;
      if (!storage.taskItem) storage.taskItem = {};
      storage.taskItem.members = members ?? [];
      storage.taskItem.checklistMode = checklistMode;
      storage.taskItem.hideDone = hideDone;
      storage.taskItem.canUseAdvancedReminderPresets = canUseAdvancedReminderPresets;
      storage.taskItem.onConvertToNote = onConvertTaskItemToNote;
    }
  }, [
    canUseAdvancedReminderPresets,
    checklistMode,
    editor,
    hideDone,
    members,
    onConvertTaskItemToNote,
  ]);

  useImperativeHandle(ref, () => ({
    insertContent: (content: any) => {
      if (!editor) return;
      if (editor.isEmpty) {
        // Replace the empty placeholder paragraph rather than leaving it dangling above.
        editor.chain().setContent(content, { emitUpdate: true }).focus('end').run();
        return;
      }
      editor.chain().focus('end').insertContent(content).run();
    },
    focus: () => {
      editor?.chain().focus('end').run();
    },
    appendTaskItem: (text: string) => {
      const value = text.trim();
      if (!editor || !value) return false;

      const paragraph = editor.schema.nodes.paragraph.create(
        null,
        editor.schema.text(value),
      );
      const taskItem = editor.schema.nodes.taskItem.create(
        {
          checked: false,
          id: uuidv4(),
          assigneeId: null,
          dueDate: null,
          reminders: [],
        },
        paragraph,
      );

      let taskListPos: number | null = null;
      let taskListNode: any = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'taskList') {
          taskListPos = pos;
          taskListNode = node;
          return false;
        }
        return taskListPos === null;
      });

      if (taskListPos === null || !taskListNode) {
        const taskList = editor.schema.nodes.taskList.create(null, taskItem);
        editor.commands.setContent(
          { type: 'doc', content: [taskList.toJSON()] },
          { emitUpdate: true },
        );
        return true;
      }

      const first = taskListNode.childCount === 1 ? taskListNode.child(0) : null;
      const firstIsBlank =
        first &&
        first.textContent.trim().length === 0 &&
        !first.attrs?.checked &&
        !first.attrs?.assigneeId &&
        !first.attrs?.dueDate &&
        (!Array.isArray(first.attrs?.reminders) || first.attrs.reminders.length === 0);

      editor
        .chain()
        .command(({ tr, dispatch }) => {
          if (!dispatch) return true;
          const listStart = (taskListPos as number) + 1;
          if (firstIsBlank) {
            tr.replaceWith(listStart, listStart + first.nodeSize, taskItem);
          } else {
            let insertPos = listStart;
            for (let index = 0; index < taskListNode.childCount; index += 1) {
              const child = taskListNode.child(index);
              if (child.attrs?.checked === true || child.attrs?.checked === 'true') break;
              insertPos += child.nodeSize;
            }
            tr.insert(insertPos, taskItem);
          }
          return true;
        })
        .run();
      return true;
    },
    replaceContent: (content: any) => {
      if (!editor) return;
      editor.commands.setContent(content || emptyContent || EMPTY_DOC, {
        emitUpdate: false,
      });
    },
    removeTaskItem: (taskItemId: string) => {
      if (!editor || !taskItemId) return false;
      let removed = false;
      const prune = (node: any): any | null => {
        if (!node || typeof node !== 'object') return node;
        if (node.type === 'taskItem' && node.attrs?.id === taskItemId) {
          removed = true;
          return null;
        }
        if (!Array.isArray(node.content)) return node;
        const content = node.content
          .map(prune)
          .filter((child: any) => child !== null);
        if (node.type === 'taskList' && content.length === 0) return null;
        return { ...node, content };
      };
      const next = prune(editor.getJSON());
      if (!removed) return false;
      editor.commands.setContent(next || emptyContent || EMPTY_DOC, {
        emitUpdate: true,
      });
      return true;
    },
  }), [editor, emptyContent]);

  const toggleAllCheckboxes = () => {
    if (!editor) return;

    const isTaskList = editor.isActive('taskList');
    editor.chain().focus().selectAll().run();
    
    if (isTaskList) {
      editor.chain().focus().liftListItem('taskItem').run();
    } else {
      editor.chain().focus().toggleList('taskList', 'taskItem').run();
    }
    editor.chain().focus().setTextSelection(editor.state.selection.to).run();
  };

  if (!editor) return null;

  return (
    <div className={cn('relative flex flex-col w-full', className)}>
      {hideToolbar ? null : (
      <div className="flex items-center gap-1 px-1 py-1.5 opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleAllCheckboxes}
          className="h-6 px-2 text-[11px] rounded bg-muted/50 hover:bg-muted"
          title="Toggle Checkboxes"
        >
          {editor.isActive('taskList') ? (
            <><Type className="w-3 h-3 mr-1" /> Plain Text</>
          ) : (
            <><CheckSquare className="w-3 h-3 mr-1" /> Checkboxes</>
          )}
        </Button>
      </div>
      )}

      <div className="py-1 px-0">
        <EditorContent editor={editor} className="min-h-[150px] outline-none" />
      </div>
    </div>
  );
});

BlockEditor.displayName = 'BlockEditor';
