import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  INK_WIDTH, INK_HEIGHT, INK_MAX_STROKES, INK_MAX_POINTS_PER_STROKE,
  appendInkStroke, emptyInk, eraseInkAt, normalizeInk, type InkStroke,
} from '../components/editor/drawing-model';
import { DrawingNode } from '../components/editor/extensions/DrawingNode';

let checks = 0;
const stroke: InkStroke = {
  id: 'stroke-one', color: '#2563eb', size: 3, tool: 'pen',
  points: [{ x: 110, y: 120, p: 0.5 }, { x: 280, y: 320, p: 0.8 }],
};
const initial = emptyInk();
const written = appendInkStroke(initial, stroke);
assert.ok(written);
assert.equal(written.strokes.length, 1);
assert.equal(initial.strokes.length, 0);
assert.equal(written.strokes[0].points[1].p, 0.8);
checks += 4;

const outside = normalizeInk({ background: 'grid', strokes: [
  { id: 'safe', color: '#ff00ff', tool: 'malicious', size: 200,
    points: [{ x: -9999, y: Infinity, p: 8 }, { x: INK_WIDTH + 500, y: INK_HEIGHT + 100, p: 3 }] },
] });
assert.equal(outside.background, 'grid');
assert.equal(outside.strokes.length, 1);
assert.equal(outside.strokes[0].color, '#172554');
assert.equal(outside.strokes[0].tool, 'pen');
assert.equal(outside.strokes[0].size, 18);
assert.equal(outside.strokes[0].points.length, 1);
assert.equal(outside.strokes[0].points[0].x, INK_WIDTH);
assert.equal(outside.strokes[0].points[0].y, INK_HEIGHT);
assert.equal(outside.strokes[0].points[0].p, 1);
checks += 9;

const erased = eraseInkAt(written, { x: 110, y: 120, p: 0.5 });
assert.equal(erased.strokes.length, 0);
const untouched = eraseInkAt(written, { x: 800, y: 15, p: 0.5 });
assert.strictEqual(untouched, written);
checks += 2;

const oversized = normalizeInk({
  background: 'ruled',
  strokes: Array.from({ length: INK_MAX_STROKES + 35 }, (_, i) => ({
    ...stroke, id: 'item-' + i,
    points: Array.from({ length: INK_MAX_POINTS_PER_STROKE + 50 },
      (_, j) => ({ x: 100 + (j % 90), y: 100, p: 0.5 })),
  })),
});
assert.ok(oversized.strokes.length <= INK_MAX_STROKES);
assert.ok(oversized.strokes.every(item => item.points.length <= INK_MAX_POINTS_PER_STROKE));
checks += 2;

// A saved note's TipTap JSON must round-trip with exact editable pen data.
const schema = getSchema([StarterKit, DrawingNode]);
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Meeting notes' }] },
    { type: 'drawing', attrs: { drawing: written } },
    { type: 'paragraph' },
  ],
};
const saved = schema.nodeFromJSON(doc).toJSON();
assert.deepEqual(schema.nodeFromJSON(JSON.parse(JSON.stringify(saved))).toJSON(), saved);
assert.equal(saved.content[1].type, 'drawing');
assert.deepEqual(saved.content[1].attrs.drawing.strokes, [stroke]);
checks += 3;

console.log(JSON.stringify({ drawingModelChecks: checks, vectorNoteRoundTrip: true }));
