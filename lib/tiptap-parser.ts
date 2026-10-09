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

export interface ChecklistItemData {
  id: string;
  text: string;
  checked: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  reminders: string[];
  completedAt: string | null;
}

/** Extracts reminder/assignment metadata from canonical TipTap taskItem nodes. */
export function extractChecklistItemsFromTipTap(json: any): ChecklistItemData[] {
  const items: ChecklistItemData[] = [];

  function traverse(node: any) {
    if (!node || typeof node !== 'object') return;
    
    // Keep the canonical node intact in storage; expose only the metadata consumers need.
    if (node.type === 'taskItem') {
      const attrs = node.attrs || {};
      
      items.push({
        id: typeof attrs.id === 'string' ? attrs.id : '',
        text: extractTextFromNode({ content: node.content }).trim(),
        checked: attrs.checked === true,
        assigneeId: typeof attrs.assigneeId === 'string' && attrs.assigneeId ? attrs.assigneeId : null,
        dueDate: typeof attrs.dueDate === 'string' && attrs.dueDate ? attrs.dueDate : null,
        reminders: Array.isArray(attrs.reminders)
          ? attrs.reminders.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
          : [],
        completedAt: typeof attrs.completedAt === 'string' && attrs.completedAt
          ? attrs.completedAt
          : null,
      });
    }

    // Continue traversing down the AST
    if (Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);
  
  return items;
}

/** Appends a row without changing any existing TipTap nodes or attributes. */
export function appendChecklistItemToTipTap(
  json: any,
  item: Pick<ChecklistItemData, 'id' | 'text'>,
) {
  const document =
    json && json.type === 'doc' && Array.isArray(json.content)
      ? { ...json, content: [...json.content] }
      : { type: 'doc', content: [] as any[] };
  const taskItem = {
    type: 'taskItem',
    attrs: {
      checked: false,
      id: item.id,
      assigneeId: null,
      dueDate: null,
      reminders: [],
      completedAt: null,
    },
    content: [
      {
        type: 'paragraph',
        content: item.text ? [{ type: 'text', text: item.text }] : [],
      },
    ],
  };
  const listIndex = document.content.findIndex((node: any) => node?.type === 'taskList');
  if (listIndex === -1) {
    document.content.push({ type: 'taskList', content: [taskItem] });
  } else {
    const list = document.content[listIndex];
    document.content[listIndex] = {
      ...list,
      content: [...(Array.isArray(list.content) ? list.content : []), taskItem],
    };
  }
  return document;
}
