import type { Editor } from '@tiptap/core';

function isCheckedAttr(value: unknown): boolean {
  return value === true || value === 'true';
}

/** Move all completed top-level taskItems into one canonical final taskList. */
export function groupChecklistItem(editor: Editor, taskItemId: string): boolean {
  if (!editor || editor.isDestroyed || !taskItemId) return false;
  const current = editor.getJSON();
  const next = normalizeChecklistDocument(current, taskItemId);
  if (JSON.stringify(next) === JSON.stringify(current)) return true;
  editor.commands.setContent(next, { emitUpdate: true });
  return true;
}

/** Update a row by stable id (safe even after its NodeView was reordered/remounted). */
export function setChecklistItemChecked(
  editor: Editor,
  taskItemId: string,
  checked: boolean,
  completedAt: string | null = checked ? new Date().toISOString() : null,
): boolean {
  if (!editor || editor.isDestroyed || !taskItemId) return false;
  let taskItemPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'taskItem' && node.attrs?.id === taskItemId) {
      taskItemPos = pos;
      return false;
    }
    return taskItemPos === null;
  });
  if (taskItemPos === null) return false;
  const node = editor.state.doc.nodeAt(taskItemPos);
  if (!node || isCheckedAttr(node.attrs?.checked) === checked) return true;
  const transaction = editor.state.tr.setNodeMarkup(taskItemPos, undefined, {
    ...node.attrs,
    checked,
    completedAt,
  });
  editor.view.dispatch(transaction);
  return true;
}

/** Immutable variant used by execution surfaces that do not own a mounted editor. */
export function setChecklistItemCheckedInDocument(
  document: any,
  taskItemId: string,
  checked: boolean,
  completedAt: string | null = checked ? new Date().toISOString() : null,
): any | null {
  if (!document || typeof document !== 'object' || !taskItemId) return null;
  let found = false;
  const update = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'taskItem' && node.attrs?.id === taskItemId) {
      found = true;
      return {
        ...node,
        attrs: { ...node.attrs, checked, completedAt },
      };
    }
    if (!Array.isArray(node.content)) return node;
    return { ...node, content: node.content.map(update) };
  };
  const updated = update(document);
  return found ? normalizeChecklistDocument(updated, checked ? taskItemId : undefined) : null;
}

function taskItemText(node: any): string {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(taskItemText).join(' ');
}

function isMeaningfulTaskItem(node: any): boolean {
  if (!node || node.type !== 'taskItem') return true;
  const attrs = node.attrs ?? {};
  return Boolean(
    taskItemText(node).trim() ||
      isCheckedAttr(attrs.checked) ||
      attrs.assigneeId ||
      attrs.dueDate ||
      (Array.isArray(attrs.reminders) && attrs.reminders.length > 0),
  );
}

function completedAtTime(node: any): number | null {
  const value = node?.attrs?.completedAt;
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isEmptyBoundaryParagraph(node: any): boolean {
  return (
    node?.type === 'paragraph' &&
    (!Array.isArray(node.content) || node.content.length === 0)
  );
}

/**
 * Canonical checklist layout:
 * - paragraphs/headings and active task lists keep their document position;
 * - checked top-level items live in one final taskList;
 * - completedAt descending defines completion order, with legacy rows stable.
 */
export function normalizeChecklistDocument(
  document: any,
  preferredCompletedId?: string,
): any {
  if (
    !document ||
    typeof document !== 'object' ||
    document.type !== 'doc' ||
    !Array.isArray(document.content)
  ) return document;

  const activeBlocks: any[] = [];
  const completed: Array<{ node: any; index: number }> = [];
  let completedListTemplate: any = null;
  let encounterIndex = 0;

  for (const block of document.content) {
    if (block?.type !== 'taskList' || !Array.isArray(block.content)) {
      activeBlocks.push(block);
      continue;
    }

    const activeItems: any[] = [];
    for (const item of block.content) {
      if (item?.type === 'taskItem' && isCheckedAttr(item.attrs?.checked)) {
        completedListTemplate ??= block;
        completed.push({ node: item, index: encounterIndex });
        encounterIndex += 1;
      } else {
        activeItems.push(item);
      }
    }

    if (activeItems.length > 0) {
      activeBlocks.push({ ...block, content: activeItems });
    }
  }

  completed.sort((left, right) => {
    const leftId = left.node?.attrs?.id;
    const rightId = right.node?.attrs?.id;
    if (preferredCompletedId && leftId === preferredCompletedId && rightId !== preferredCompletedId) {
      return -1;
    }
    if (preferredCompletedId && rightId === preferredCompletedId && leftId !== preferredCompletedId) {
      return 1;
    }

    const leftTime = completedAtTime(left.node);
    const rightTime = completedAtTime(right.node);
    if (leftTime !== null || rightTime !== null) {
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      if (leftTime !== rightTime) return rightTime - leftTime;
    }
    return left.index - right.index;
  });

  if (completed.length > 0) {
    // ProseMirror can leave an empty top-level paragraph at the position from
    // which a list was split or moved. Once completed rows are collected into
    // their canonical final taskList, those structural boundary paragraphs
    // would accumulate before the completed group on every reorder. Only trim
    // contiguous, truly empty paragraphs at this managed boundary; intentional
    // text, headings, hard breaks and spacing elsewhere remain untouched.
    while (isEmptyBoundaryParagraph(activeBlocks[activeBlocks.length - 1])) {
      activeBlocks.pop();
    }

    const template = completedListTemplate ?? { type: 'taskList' };
    activeBlocks.push({
      ...template,
      content: completed.map((entry) => entry.node),
    });
  }

  return { ...document, content: activeBlocks };
}

/** Remove only metadata-free blank task rows before persistence. */
export function sanitizeChecklistDocument(document: any): any {
  if (!document || typeof document !== 'object') return document;

  const sanitizeNode = (node: any): any | null => {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'taskItem' && !isMeaningfulTaskItem(node)) return null;
    if (!Array.isArray(node.content)) return { ...node };

    const content = node.content
      .map(sanitizeNode)
      .filter((child: any) => child !== null);
    if (node.type === 'taskList' && content.length === 0) return null;
    return { ...node, content };
  };

  return sanitizeNode(document) ?? { type: 'doc', content: [] };
}
