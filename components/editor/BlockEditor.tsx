import React, { forwardRef, useImperativeHandle, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import { AdvancedTaskItem } from './extensions/AdvancedTaskItem';
import { Button } from '@/components/ui/button';
import { CheckSquare, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
// @ts-ignore: TS doesn't have types for CSS module side-effects
import "mobile-drag-drop/default.css";

// Initialize mobile drag and drop polyfill globally once
if (typeof window !== 'undefined' && !(window as any).__isMobileDragDropLoaded) {
  (window as any).__isMobileDragDropLoaded = true;
  polyfill({
    // Enable auto-scrolling while dragging on mobile
    dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
    // iOS Safari has a broken native HTML5 drag and drop implementation for DOM nodes.
    // We MUST force the polyfill to take over on all touch devices.
    forceApply: true,
    // Add a slight delay to prevent accidental drags when scrolling
    holdToDrag: 100
  });
  
  // Workaround for some iOS 11+ bugs with touchmove and drag-drop
  window.addEventListener('touchmove', () => {}, { passive: false });
}

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
        class: 'focus:outline-none min-h-[120px] prose dark:prose-invert max-w-none text-sm',
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

    // A simple global toggle: if we have task lists, turn them into paragraphs.
    // If not, turn everything into a task list.
    const isTaskList = editor.isActive('taskList');
    
    editor.chain().focus().selectAll().run();
    
    if (isTaskList) {
      editor.chain().focus().liftListItem('taskItem').run();
    } else {
      editor.chain().focus().toggleList('taskList', 'taskItem').run();
    }
    
    // Clear selection
    editor.chain().focus().setTextSelection(editor.state.selection.to).run();
  };

  if (!editor) return null;

  return (
    <div className={cn('relative flex flex-col w-full rounded-md border border-input bg-transparent shadow-sm', className)}>
      <div className="flex items-center gap-1 border-b border-input px-2 py-1.5 bg-muted/20">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleAllCheckboxes}
          className="h-7 px-2 text-xs"
          title="Toggle Checkboxes"
        >
          {editor.isActive('taskList') ? (
            <><Type className="w-3.5 h-3.5 mr-1" /> Plain Text</>
          ) : (
            <><CheckSquare className="w-3.5 h-3.5 mr-1" /> Checkboxes</>
          )}
        </Button>
      </div>
      
      <div className="p-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

