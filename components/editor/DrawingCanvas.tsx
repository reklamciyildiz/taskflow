'use client';

import React from 'react';
import { toast } from 'sonner';
import { Download, Eraser, Highlighter, Pencil, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import {
  INK_WIDTH, INK_HEIGHT, INK_COLORS, INK_MAX_POINTS_PER_STROKE,
  appendInkStroke, eraseInkAt, paintInk, type InkDocument,
  type InkPoint, type InkStroke, type InkTool, type InkBackground,
} from './drawing-model';

type InkAction = InkTool | 'eraser';
type ActivePointer = {
  id: number;
  tool: InkAction;
  stroke: InkStroke | null;
  erased: InkDocument | null;
};

function useInkSurface(
  doc: InkDocument,
  onCommit: (next: InkDocument) => void,
  tool: InkAction,
  color: string,
  size: number,
  editable: boolean,
) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const docRef = React.useRef(doc);
  const activeRef = React.useRef<ActivePointer | null>(null);
  const penAtRef = React.useRef(0);
  const paintRef = React.useRef<() => void>(() => {});
  const [drawing, setDrawing] = React.useState(false);

  const repaint = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(canvas.width / INK_WIDTH, 0, 0, canvas.height / INK_HEIGHT, 0, 0);
    const active = activeRef.current;
    paintInk(ctx, active?.erased ?? docRef.current, active?.stroke);
  }, []);
  paintRef.current = repaint;

  React.useEffect(() => {
    docRef.current = doc;
    paintRef.current();
  }, [doc]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(bounds.width * dpr));
      canvas.height = Math.max(1, Math.round(bounds.height * dpr));
      paintRef.current();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [repaint]);

  const samplePoint = (e: React.PointerEvent<HTMLCanvasElement>): InkPoint => {
    const b = e.currentTarget.getBoundingClientRect();
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return {
      x: Math.round(Math.max(0, Math.min(INK_WIDTH, (e.clientX - b.left) / b.width * INK_WIDTH)) * 10) / 10,
      y: Math.round(Math.max(0, Math.min(INK_HEIGHT, (e.clientY - b.top) / b.height * INK_HEIGHT)) * 10) / 10,
      p: Math.round(Math.max(0.05, Math.min(1, pressure)) * 10) / 10,
    };
  };

  const applyPoint = (e: React.PointerEvent<HTMLCanvasElement>, pointer: ActivePointer) => {
    const point = samplePoint(e);
    if (pointer.tool === 'eraser') {
      pointer.erased = eraseInkAt(pointer.erased ?? docRef.current, point, size * 4 + 7);
    } else if (pointer.stroke && pointer.stroke.points.length < INK_MAX_POINTS_PER_STROKE) {
      const previous = pointer.stroke.points.at(-1);
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 1.3)
        pointer.stroke.points.push(point);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editable || activeRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType === 'pen') penAtRef.current = Date.now();
    // Palm rejection heuristic: ignore touch immediately after an active stylus.
    if (e.pointerType === 'touch' && Date.now() - penAtRef.current < 1100) return;
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = samplePoint(e);
    const stroke = tool === 'eraser' ? null : {
      id: crypto.randomUUID(), tool, color, size,
      points: [point],
    } satisfies InkStroke;
    const active: ActivePointer = { id: e.pointerId, tool, stroke, erased: null };
    activeRef.current = active;
    if (tool === 'eraser') active.erased = eraseInkAt(docRef.current, point, size * 4 + 7);
    setDrawing(true);
    paintRef.current();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = activeRef.current;
    if (!pointer || pointer.id !== e.pointerId) return;
    e.preventDefault();
    if (e.pointerType === 'pen') penAtRef.current = Date.now();
    // Coalesced coordinates improve strokes on high-frequency digital pens.
    const samples = typeof e.nativeEvent.getCoalescedEvents === 'function'
      ? e.nativeEvent.getCoalescedEvents() : [];
    if (samples.length) {
      const b = e.currentTarget.getBoundingClientRect();
      for (const sample of samples) {
        const x = Math.round(Math.max(0, Math.min(INK_WIDTH, (sample.clientX - b.left) / b.width * INK_WIDTH)) * 10) / 10;
        const y = Math.round(Math.max(0, Math.min(INK_HEIGHT, (sample.clientY - b.top) / b.height * INK_HEIGHT)) * 10) / 10;
        const p = Math.round(Math.max(0.05, Math.min(1,
          e.pointerType === 'pen' && sample.pressure > 0 ? sample.pressure : 0.5)) * 10) / 10;
        if (pointer.tool === 'eraser') {
          pointer.erased = eraseInkAt(pointer.erased ?? docRef.current, { x, y, p }, size * 4 + 7);
        } else if (pointer.stroke && pointer.stroke.points.length < INK_MAX_POINTS_PER_STROKE) {
          const previous = pointer.stroke.points.at(-1);
          if (!previous || Math.hypot(x - previous.x, y - previous.y) >= 1.3)
            pointer.stroke.points.push({ x, y, p });
        }
      }
    } else applyPoint(e, pointer);
    paintRef.current();
  };

  const finalize = (e: React.PointerEvent<HTMLCanvasElement>, canceled: boolean) => {
    const pointer = activeRef.current;
    if (!pointer || pointer.id !== e.pointerId) return;
    if (!canceled) applyPoint(e, pointer);
    activeRef.current = null;
    setDrawing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!canceled) {
      const next = pointer.tool === 'eraser'
        ? pointer.erased
        : pointer.stroke ? appendInkStroke(docRef.current, pointer.stroke) : null;
      if (next && next !== docRef.current) {
        docRef.current = next;
        onCommit(next);
      } else if (pointer.stroke) {
        toast.error('This drawing has reached its size limit. Start another drawing block.');
      }
    }
    paintRef.current();
  };

  return {
    canvasRef,
    drawing,
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => finalize(e, false),
    onPointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => finalize(e, true),
  };
}

export function InkPaper({
  value, onCommit, tool = 'pen', color = '#172554', size = 3,
  editable = true, label = 'Drawing canvas', className = '',
}: {
  value: InkDocument;
  onCommit: (next: InkDocument) => void;
  tool?: InkAction;
  color?: string;
  size?: number;
  editable?: boolean;
  label?: string;
  className?: string;
}) {
  const ink = useInkSurface(value, onCommit, tool, color, size, editable);
  return (
    <canvas
      ref={ink.canvasRef}
      aria-label={label}
      className={'actiproc-ink-paper ' + className}
      style={{ aspectRatio: INK_WIDTH + ' / ' + INK_HEIGHT, touchAction: editable ? 'none' : 'auto' }}
      onPointerDown={ink.onPointerDown}
      onPointerMove={ink.onPointerMove}
      onPointerUp={ink.onPointerUp}
      onPointerCancel={ink.onPointerCancel}
      onContextMenu={event => { if (editable) event.preventDefault(); }}
      data-drawing-active={ink.drawing}
    />
  );
}

export function InkStudio({
  value, onChange, readOnly = false,
}: {
  value: InkDocument;
  onChange: (next: InkDocument) => void;
  readOnly?: boolean;
}) {
  const [tool, setTool] = React.useState<InkAction>('pen');
  const [color, setColor] = React.useState('#172554');
  const [size, setSize] = React.useState(3);
  const history = React.useRef<InkDocument[]>([]);
  const redo = React.useRef<InkDocument[]>([]);
  const latest = React.useRef(value);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => { latest.current = value; }, [value]);

  const commit = (next: InkDocument) => {
    history.current = [...history.current.slice(-29), latest.current];
    redo.current = [];
    latest.current = next;
    onChange(next);
    setRevision(value => value + 1);
  };

  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    redo.current.push(latest.current);
    latest.current = previous;
    onChange(previous);
    setRevision(value => value + 1);
  };
  const redoAction = () => {
    const next = redo.current.pop();
    if (!next) return;
    history.current.push(latest.current);
    latest.current = next;
    onChange(next);
    setRevision(value => value + 1);
  };

  const exportPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = INK_WIDTH * 2;
    canvas.height = INK_HEIGHT * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    paintInk(ctx, latest.current);
    canvas.toBlob(blob => {
      if (!blob) { toast.error('Could not export drawing.'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'actiproc-handwriting.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, 'image/png');
  };

  return (
    <div className="actiproc-ink-studio">
      {!readOnly && (
        <div className="actiproc-ink-toolbar" role="toolbar" aria-label="Drawing tools">
          {([
            ['pen', Pencil, 'Pen'],
            ['marker', Highlighter, 'Highlighter'],
            ['eraser', Eraser, 'Eraser'],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
              className={'actiproc-ink-tool ' + (tool === value ? 'is-active' : '')}
            ><Icon size={17} aria-hidden="true" /><span>{label}</span></button>
          ))}
          <span className="actiproc-ink-divider" aria-hidden="true" />
          <div className="actiproc-ink-palette" role="group" aria-label="Ink colors">
            {INK_COLORS.map(choice => (
              <button
                type="button" key={choice}
                aria-label={'Ink color ' + choice}
                aria-pressed={color === choice}
                title={choice}
                onClick={() => { setColor(choice); if (tool === 'eraser') setTool('pen'); }}
                className={'actiproc-ink-swatch ' + (color === choice ? 'is-active' : '')}
                style={{ background: choice }}
              />
            ))}
          </div>
          <label className="actiproc-ink-size">
            <span>Size</span>
            <input type="range" aria-label="Pen size" min={1} max={12} value={size}
              onChange={event => setSize(Number(event.target.value))}/>
          </label>
          <span className="actiproc-ink-divider" aria-hidden="true" />
          <button type="button" className="actiproc-ink-tool" onClick={undo}
            disabled={!history.current.length} aria-label="Undo drawing" title="Undo">
            <Undo2 size={17} aria-hidden /></button>
          <button type="button" className="actiproc-ink-tool" onClick={redoAction}
            disabled={!redo.current.length} aria-label="Redo drawing" title="Redo">
            <Redo2 size={17} aria-hidden /></button>
          <button type="button" className="actiproc-ink-tool" title="Clear all strokes"
            aria-label="Clear drawing" disabled={!value.strokes.length}
            onClick={() => { if (window.confirm('Clear this drawing? You can undo this change.')) commit({ ...latest.current, strokes: [] }); }}>
            <RotateCcw size={16} aria-hidden /></button>
        </div>
      )}
      <div className="actiproc-ink-layout">
        <InkPaper
          value={value}
          onCommit={commit}
          tool={tool}
          color={color}
          size={size}
          editable={!readOnly}
          label="Ink drawing canvas"
        />
      </div>
      <div className="actiproc-ink-footer">
        {!readOnly && (
          <label className="actiproc-ink-background">
            Paper
            <select value={value.background} aria-label="Drawing paper style"
              onChange={event => commit({ ...latest.current, background: event.target.value as InkBackground })}>
              <option value="ruled">Ruled</option>
              <option value="grid">Grid</option>
              <option value="plain">Plain</option>
            </select>
          </label>
        )}
        <span className="actiproc-ink-hint">
          {readOnly ? 'Read-only drawing' : 'Changes are saved in the note after each stroke · Pen, touch or mouse'}
        </span>
        <button type="button" className="actiproc-ink-export" onClick={exportPng}>
          <Download size={15} aria-hidden /> Export PNG
        </button>
      </div>
      <span className="sr-only" data-ink-revision={revision} aria-live="polite">
        {value.strokes.length} strokes saved in drawing
      </span>
    </div>
  );
}
