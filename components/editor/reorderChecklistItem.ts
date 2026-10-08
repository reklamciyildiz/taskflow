import type { Editor } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';

function isCheckedAttr(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Sibling order after a row is toggled: every still-open item, then the toggled
 * row, then the rest of the done items.
 *
 * That is the original ActionChecklist rule — a newly completed item drops to
 * the top of the completed group (immediately under the last open item).
 * Unchecking lifts it to the bottom of the open group.
 */
export function desiredChecklistSiblingOrder(
  siblingChecked: boolean[],
  toggledIndex: number,
  checked = !siblingChecked[toggledIndex],
): number[] {
  const nextChecked = siblingChecked.map((value, index) =>
    index === toggledIndex ? checked : value,
  );
  const open: number[] = [];
  const done: number[] = [];
  nextChecked.forEach((value, index) => {
    (value ? done : open).push(index);
  });
  return [...open, ...done];
}

/**
 * Set `checked` and move the taskItem inside its parent taskList in one
 * transaction. Avoids `setContent` (which remounts every React node view and
 * often leaves the DOM order unchanged).
 */
export function applyChecklistToggleSort(
  editor: Editor,
  getPos: (() => number | undefined) | boolean | undefined,
  checked: boolean,
): boolean {
  if (!editor || editor.isDestroyed) return false;
  if (typeof getPos !== 'function') return false;

  return editor
    .chain()
    .command(({ tr, state, dispatch }) => {
      const pos = getPos();
      if (typeof pos !== 'number' || pos < 0) return false;

      const node = state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'taskItem') return false;

      const $pos = state.doc.resolve(pos);
      const parent = $pos.parent;
      if (parent.type.name !== 'taskList') return false;

      const index = $pos.index();
      const siblingChecked: boolean[] = [];
      for (let i = 0; i < parent.childCount; i++) {
        siblingChecked.push(isCheckedAttr(parent.child(i).attrs?.checked));
      }

      const order = desiredChecklistSiblingOrder(siblingChecked, index, checked);
      const orderUnchanged = order.every((orig, i) => orig === i);
      const alreadyChecked = siblingChecked[index] === checked;
      if (orderUnchanged && alreadyChecked) return true;

      const children = order.map((orig) => {
        const child = parent.child(orig);
        if (orig !== index) return child;
        return child.type.create({ ...child.attrs, checked }, child.content, child.marks);
      });

      if (dispatch) {
        tr.replaceWith(
          $pos.before($pos.depth),
          $pos.after($pos.depth),
          parent.copy(Fragment.from(children)),
        );
      }
      return true;
    })
    .run();
}

/**
 * Move the identified row to the active/completed boundary after the brief
 * completion feedback window. This is one ProseMirror transaction and never
 * recreates the whole document.
 */
export function groupChecklistItem(editor: Editor, taskItemId: string): boolean {
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

  return editor
    .chain()
    .command(({ tr, state, dispatch }) => {
      const $pos = state.doc.resolve(taskItemPos as number);
      const parent = $pos.parent;
      if (parent.type.name !== 'taskList') return false;

      const open: ProseMirrorNode[] = [];
      const done: ProseMirrorNode[] = [];
      for (let index = 0; index < parent.childCount; index += 1) {
        const child = parent.child(index);
        (isCheckedAttr(child.attrs?.checked) ? done : open).push(child);
      }
      const children = [...open, ...done];
      const alreadyGrouped = children.every((child, index) => child === parent.child(index));
      if (alreadyGrouped) return true;

      if (dispatch) {
        tr.replaceWith(
          $pos.before($pos.depth),
          $pos.after($pos.depth),
          parent.copy(Fragment.from(children)),
        );
      }
      return true;
    })
    .run();
}

/** Update a row by stable id (safe even after its NodeView was reordered/remounted). */
export function setChecklistItemChecked(
  editor: Editor,
  taskItemId: string,
  checked: boolean,
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
  });
  editor.view.dispatch(transaction);
  return true;
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

/** Normalize existing documents on open without changing either group's order. */
export function normalizeChecklistDocument(document: any): any {
  if (!document || typeof document !== 'object') return document;
  const normalizeNode = (node: any): any => {
    if (!Array.isArray(node?.content)) return node;
    const content = node.content.map(normalizeNode);
    if (node.type !== 'taskList') return { ...node, content };
    const open = content.filter((child: any) => !isCheckedAttr(child?.attrs?.checked));
    const done = content.filter((child: any) => isCheckedAttr(child?.attrs?.checked));
    return { ...node, content: [...open, ...done] };
  };
  return normalizeNode(document);
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
