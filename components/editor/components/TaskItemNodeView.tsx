import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

export const TaskItemNodeView = ({ node, updateAttributes, view, getPos }: any) => {
  const { checked, id, assigneeId, dueDate, reminders } = node.attrs;

  // Auto-generate ID if missing when mounted
  React.useEffect(() => {
    if (!id && typeof getPos === 'function') {
      updateAttributes({ id: uuidv4() });
    }
  }, [id, getPos, updateAttributes]);

  return (
    <NodeViewWrapper className="flex items-start gap-2 my-1 group">
      <div
        className="mt-1 flex items-center justify-center select-none"
        contentEditable={false}
      >
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => updateAttributes({ checked: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
        />
      </div>

      <div className="flex-1 min-w-0">
        <NodeViewContent
          className={cn(
            'inline-block w-full',
            checked ? 'line-through text-muted-foreground' : ''
          )}
        />
        
        {/* Placeholder for metadata controls: Assignee, Due Date, Reminders */}
        {/* We can add tiny inline buttons here that only show on hover (.group-hover:flex) */}
      </div>
    </NodeViewWrapper>
  );
};

