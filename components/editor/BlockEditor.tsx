import React, { forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import { AdvancedTaskItem } from './extensions/AdvancedTaskItem';
import { Button } from '@/components/ui/button';
import { CheckSquare, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BlockEditorRef {
  /**
   * Insert TipTap JSON (node or node array) or an HTML/text string at the end of the
   * document. When the document is still empty the content replaces the placeholder
   * paragraph instead of being appended below it.
   */
  insertContent: (content: any) => void;
  focus: () => void;
}

interface BlockEditorProps {
  initialContent?: any;
  /** Document used when `initialContent` is empty (e.g. start a checklist as a task list). */
  emptyContent?: any;
  onChange?: (content: any) => void;
  placeholder?: string;
  className?: string;
  /** Team member list — passed via storage to TaskItemNodeView to avoid context re-renders */
  members?: { id: string; name: string }[];
  /** Hide the "Checkboxes / Plain text" toolbar. */
  hideToolbar?: boolean;
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export const BlockEditor = forwardRef<BlockEditorRef, BlockEditorProps>(
  (
    {
      initialContent,
      emptyContent,
      onChange,
      placeholder = 'Write something...',
      className,
      members,
      hideToolbar = false,
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
        placeholder,
        // Checklists are `taskList > taskItem > paragraph`; without this the empty
        // paragraph inside the first task item never gets the placeholder decoration.
        includeChildren: true,
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

  // Sync members into editor storage so TaskItemNodeView can read them
  // without subscribing to the global TaskContext (which would re-render
  // every row on any tasks array change, causing visible jitter).
  React.useEffect(() => {
    if (editor && members) {
      const storage = editor.storage as any;
      if (!storage.taskItem) storage.taskItem = {};
      storage.taskItem.members = members;
    }
  }, [editor, members]);

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
  }), [editor]);

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
