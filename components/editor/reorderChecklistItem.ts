import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';

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
): number[] {
  const undone: number[] = [];
  const done: number[] = [];
  for (let i = 0; i < siblingChecked.length; i++) {
    if (i === toggledIndex) continue;
    if (siblingChecked[i]) done.push(i);
    else undone.push(i);
  }
  return [...undone, toggledIndex, ...done];
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

      const order = desiredChecklistSiblingOrder(siblingChecked, index);
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
