export function extractTextFromNode(node: any): string {
  if (!node) return '';
  
  // If it's a text node, return the text directly
  if (node.type === 'text') {
    return node.text || '';
  }
  
  // Add a space for paragraph/block breaks to keep text readable
  let suffix = '';
  if (node.type === 'paragraph' || node.type === 'heading') {
    suffix = ' ';
  }

  // If it has children, traverse them
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromNode).join('') + suffix;
  }
  
  return '';
}

export interface TaskItemCounts {
  total: number;
  done: number;
}

/** Counts `taskItem` nodes in a TipTap document (cheap traversal; safe on null/invalid input). */
export function countTaskItems(json: any): TaskItemCounts {
  const counts: TaskItemCounts = { total: 0, done: 0 };
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'taskItem') {
      counts.total += 1;
      if (node.attrs?.checked) counts.done += 1;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(json);
  return counts;
}

/** Plain-text preview of a TipTap document, whitespace-collapsed and truncated. */
export function previewTextFromTipTap(json: any, maxLength = 140): string {
  const text = extractTextFromNode(json).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function extractTasksFromTipTap(json: any): any[] {
  const tasks: any[] = [];

  function traverse(node: any) {
    if (!node || typeof node !== 'object') return;
    
    // When we find a taskItem, extract it into the flat relational format
    if (node.type === 'taskItem') {
      const attrs = node.attrs || {};
      
      tasks.push({
        id: attrs.id,
        text: extractTextFromNode({ content: node.content }).trim(),
        done: !!attrs.checked,
        assignee_id: attrs.assigneeId || null,
        due_date: attrs.dueDate || null,
        reminders: Array.isArray(attrs.reminders) ? attrs.reminders : [],
      });
    }

    // Continue traversing down the AST
    if (Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);
  
  return tasks;
}

export function migrateLegacyJournalToTipTap(logs: any[]) {
  if (!logs || !Array.isArray(logs) || logs.length === 0) return null;
  // Ignore the 'quick row' id if present
  const validLogs = logs.filter(l => l.id !== 'QUICK_ROW_ADD_NEW');
  if (validLogs.length === 0) return null;
  
  return {
    type: 'doc',
    content: [
      {
        type: 'taskList',
        content: validLogs.map(log => ({
          type: 'taskItem',
          attrs: {
            checked: !!log.done,
            id: log.id,
            assigneeId: log.assignee_id || log.assigneeId || null,
            dueDate: log.due_date || log.dueDate || null,
            reminders: Array.isArray(log.reminders) ? log.reminders : []
          },
          content: [
            {
              type: 'paragraph',
              content: log.text ? [{ type: 'text', text: log.text }] : undefined
            }
          ]
        }))
      }
    ]
  };
}

export function migrateLegacyLearningsToTipTap(text: string) {
  if (!text) return null;
  const paragraphs = text.split('\n\n').map(p => ({
    type: 'paragraph',
    content: p ? [{ type: 'text', text: p }] : undefined
  }));
  return {
    type: 'doc',
    content: paragraphs
  };
}

