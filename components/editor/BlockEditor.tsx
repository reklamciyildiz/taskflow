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
  insertContent: (content: string) => void;
}

interface BlockEditorProps {
  initialContent?: any;
  onChange?: (content: any) => void;
  placeholder?: string;
  className?: string;
}

export const BlockEditor = forwardRef<BlockEditorRef, BlockEditorProps>(
  ({ initialContent, onChange, placeholder = 'Write something...', className }, ref) => {
  const editor = useEditor({
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
      }),
    ],
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph' }] },
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

  useImperativeHandle(ref, () => ({
    insertContent: (content: string) => {
      if (editor) {
        editor.chain().focus().insertContent(content).run();
      }
    }
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
      
      <div className="py-1 px-0">
        <EditorContent editor={editor} className="min-h-[150px] outline-none" />
      </div>
    </div>
  );
});

BlockEditor.displayName = 'BlockEditor';
