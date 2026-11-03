'use client';

import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { PenLine, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { emptyInk, normalizeInk, type InkDocument } from '../drawing-model';
import { InkPaper, InkStudio } from '../DrawingCanvas';

function DrawingView({ node, editor, updateAttributes, selected }: NodeViewProps) {
  const [open, setOpen] = React.useState(false);
  const drawing = normalizeInk(node.attrs.drawing);
  const editable = editor.isEditable;

  const update = (next: InkDocument) => {
    if (editor.isDestroyed || !editor.isEditable) return;
    updateAttributes({ drawing: next });
  };

  return (
    <NodeViewWrapper
      contentEditable={false}
      className={'actiproc-drawing-block ' + (selected ? 'is-selected' : '')}
      data-actiproc-drawing=""
      data-ink-strokes={drawing.strokes.length}
    >
      <div className="actiproc-drawing-heading">
        <span><PenLine size={15} aria-hidden="true"/> Handwritten note</span>
        <span>{drawing.strokes.length} strokes</span>
      </div>
      <button type="button"
        aria-label={editable ? 'Edit handwriting' : 'View handwriting'}
        className="actiproc-drawing-preview"
        onClick={() => setOpen(true)}
      >
        <InkPaper value={drawing} editable={false} onCommit={() => {}} label="Handwriting preview"/>
        <span className="actiproc-drawing-open">
          <Maximize2 size={15} aria-hidden="true"/>
          {drawing.strokes.length ? (editable ? 'Open editor' : 'View drawing') : 'Tap to write'}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="actiproc-ink-dialog w-[calc(100vw-1rem)] max-w-[1160px] max-h-[min(96dvh,1050px)] overflow-y-auto rounded-2xl p-3 sm:p-5"
          overlayClassName="z-[430]"
        >
          <div className="pr-10">
            <DialogTitle>Handwriting & sketches</DialogTitle>
            <DialogDescription>
              Draw directly in this note. Your strokes remain editable and are saved with the note.
            </DialogDescription>
          </div>
          <InkStudio value={drawing} onChange={update} readOnly={!editable}/>
          <div className="flex justify-end">
            <button type="button" className="actiproc-ink-done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}

export const DrawingNode = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { drawing: { default: emptyInk(), rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-actiproc-drawing]' }];
  },
  renderHTML({ HTMLAttributes }) {
    // Do not expose the full vector payload in an unsafe HTML attribute.
    // The canonical TipTap JSON is what is saved and round-tripped.
    return ['div', mergeAttributes(HTMLAttributes, { 'data-actiproc-drawing': '' }), 'Handwritten note'];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DrawingView);
  },
});
