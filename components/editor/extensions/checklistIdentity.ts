import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { v4 as uuidv4 } from 'uuid';

/** Identity belongs to a work item, never to copied HTML. Runs before autosave. */
export function checklistIdentityPlugin(): Plugin {
  let cutItems = new Map<string, ProseMirrorNode['attrs']>();
  return new Plugin({
    props: {
      handleDOMEvents: {
        copy: () => { cutItems.clear(); return false; },
        cut: (view) => {
          cutItems.clear();
          view.state.selection.content().content.descendants(node => {
            if (node.type.name === 'taskItem' && node.attrs.id) cutItems.set(node.attrs.id, node.attrs);
          });
          return false;
        },
      },
      handlePaste(view, _event, slice) {
        if (!view.editable) return false;
        const existing = new Set<string>();
        view.state.doc.descendants(node => {
          if (node.type.name === 'taskItem' && node.attrs.id) existing.add(node.attrs.id);
        });
        let changed = false;
        const map = (fragment: Fragment): Fragment => {
          const nodes: ProseMirrorNode[] = [];
          fragment.forEach(node => {
            const content = map(node.content);
            if (node.type.name !== 'taskItem') { nodes.push(node.copy(content)); return; }
            changed = true;
            // A cut within this editor is a move. Copy/paste (including another
            // Action) creates independent work with no borrowed schedule binding.
            const moved = !existing.has(node.attrs.id) ? cutItems.get(node.attrs.id) : undefined;
            const attrs = moved ?? {
              ...node.attrs, id: uuidv4(), schedule: null, dueDate: null, reminders: [],
              assigneeId: null,
            };
            nodes.push(node.type.create(attrs, content, node.marks));
          });
          return Fragment.fromArray(nodes);
        };
        const content = map(slice.content);
        cutItems.clear();
        if (!changed) return false; // Preserve default rich/plain text and link paste.
        view.dispatch(view.state.tr.replaceSelection(new Slice(content, slice.openStart, slice.openEnd))
          .setMeta('paste', true).setMeta('uiEvent', 'paste').scrollIntoView());
        return true;
      },
    },
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some(transaction => transaction.docChanged)) return null;
      // Prefer the original node when insertion introduces a duplicate before it.
      const retained = new Map<string, number>();
      oldState.doc.descendants((node, position) => {
        if (node.type.name !== 'taskItem' || !node.attrs.id) return;
        let mapped = position;
        let deleted = false;
        for (const transaction of transactions) {
          const result = transaction.mapping.mapResult(mapped, 1);
          mapped = result.pos;
          deleted ||= result.deleted;
        }
        if (!deleted && newState.doc.nodeAt(mapped)?.attrs.id === node.attrs.id) {
          retained.set(node.attrs.id, mapped);
        }
      });
      const seen = new Set<string>();
      const tr = newState.tr;
      newState.doc.descendants((node, position) => {
        if (node.type.name !== 'taskItem') return;
        const id = typeof node.attrs.id === 'string' ? node.attrs.id.trim() : '';
        const duplicate = id && (seen.has(id) || (retained.has(id) && retained.get(id) !== position));
        if (!id || duplicate) {
          tr.setNodeMarkup(position, undefined, {
            ...node.attrs, id: uuidv4(),
            ...(duplicate ? { schedule: null, dueDate: null, reminders: [], assigneeId: null } : {}),
          });
        } else seen.add(id);
      });
      return tr.docChanged ? tr : null;
    },
  });
}
