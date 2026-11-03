/** Bounded, versioned vector ink data persisted inside canonical Note TipTap JSON.
 * No bitmap or third-party service required. All coordinates are canonical page space.
 */
export const INK_WIDTH = 1024;
export const INK_HEIGHT = 640;
export const INK_MAX_STROKES = 240;
export const INK_MAX_POINTS_PER_STROKE = 650;
export const INK_MAX_TOTAL_POINTS = 18_000;

export type InkBackground = 'plain' | 'ruled' | 'grid';
export type InkTool = 'pen' | 'marker';
export type InkPoint = { x: number; y: number; p: number };
export type InkStroke = {
  id: string;
  color: string;
  size: number;
  tool: InkTool;
  points: InkPoint[];
};
export type InkDocument = {
  version: 1;
  background: InkBackground;
  strokes: InkStroke[];
};

export const INK_COLORS = [
  '#172554', '#334155', '#2563eb', '#7c3aed',
  '#16a34a', '#dc2626', '#f59e0b',
] as const;

const bounded = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
const round = (value: number) => Math.round(value * 10) / 10;

export const EMPTY_INK: InkDocument = { version: 1, background: 'ruled', strokes: [] };
export const emptyInk = (): InkDocument => ({ version: 1, background: 'ruled', strokes: [] });

export function normalizeInk(value: unknown): InkDocument {
  if (!value || typeof value !== 'object') return emptyInk();
  const input = value as { background?: unknown; strokes?: unknown };
  const background: InkBackground = input.background === 'grid' || input.background === 'plain'
    ? input.background : 'ruled';
  const strokes: InkStroke[] = [];
  let count = 0;
  if (Array.isArray(input.strokes)) {
    for (const source of input.strokes.slice(0, INK_MAX_STROKES)) {
      if (!source || typeof source !== 'object') continue;
      const raw = source as Partial<InkStroke>;
      if (!Array.isArray(raw.points) || !raw.points.length) continue;
      const points: InkPoint[] = [];
      for (const sample of raw.points.slice(0, Math.min(INK_MAX_POINTS_PER_STROKE, INK_MAX_TOTAL_POINTS - count))) {
        if (!sample || typeof sample !== 'object') continue;
        const p = sample as Partial<InkPoint>;
        if (![p.x, p.y, p.p].every(v => typeof v === 'number' && Number.isFinite(v))) continue;
        points.push({
          x: round(bounded(p.x, 0, INK_WIDTH, 0)),
          y: round(bounded(p.y, 0, INK_HEIGHT, 0)),
          p: round(bounded(p.p, 0.05, 1, 0.5)),
        });
      }
      if (!points.length) continue;
      count += points.length;
      strokes.push({
        id: typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id)
          ? raw.id : 'legacy-' + strokes.length,
        color: INK_COLORS.find(color => color === raw.color) ?? '#172554',
        size: round(bounded(raw.size, 1, 18, 3)),
        tool: raw.tool === 'marker' ? 'marker' : 'pen',
        points,
      });
      if (count >= INK_MAX_TOTAL_POINTS) break;
    }
  }
  return { version: 1, background, strokes };
}

export function appendInkStroke(drawing: InkDocument, stroke: InkStroke): InkDocument | null {
  if (drawing.strokes.length >= INK_MAX_STROKES) return null;
  const total = drawing.strokes.reduce((count, item) => count + item.points.length, 0);
  if (total + stroke.points.length > INK_MAX_TOTAL_POINTS) return null;
  const cleaned = normalizeInk({
    background: drawing.background,
    strokes: [...drawing.strokes, stroke],
  });
  if (cleaned.strokes.length !== drawing.strokes.length + 1) return null;
  return cleaned;
}

function segmentDistanceSquared(point: InkPoint, start: InkPoint, end: InkPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

/** Object eraser: removes hit strokes, enabling clean undo/redo and safe export. */
export function eraseInkAt(drawing: InkDocument, point: InkPoint, radius = 13): InkDocument {
  const survivors = drawing.strokes.filter(stroke => {
    const tolerance = radius + stroke.size * (stroke.tool === 'marker' ? 1.4 : 0.7);
    const maximum = tolerance * tolerance;
    const path = stroke.points;
    if (path.length === 1) return segmentDistanceSquared(point, path[0], path[0]) > maximum;
    for (let i = 1; i < path.length; i++) {
      if (segmentDistanceSquared(point, path[i - 1], path[i]) <= maximum) return false;
    }
    return true;
  });
  return survivors.length === drawing.strokes.length ? drawing :
    { ...drawing, strokes: survivors };
}

/** Render onto any 2D context with a canonical 1024x640 coordinate system. */
export function paintInk(
  ctx: CanvasRenderingContext2D,
  drawing: InkDocument,
  active?: InkStroke | null,
) {
  ctx.clearRect(0, 0, INK_WIDTH, INK_HEIGHT);
  ctx.fillStyle = '#fffdf9';
  ctx.fillRect(0, 0, INK_WIDTH, INK_HEIGHT);
  if (drawing.background !== 'plain') {
    ctx.strokeStyle = drawing.background === 'grid' ? '#dce8f4' : '#cfdeec';
    ctx.lineWidth = 1;
    const spacing = drawing.background === 'grid' ? 28 : 36;
    for (let y = spacing; y < INK_HEIGHT; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(INK_WIDTH, y); ctx.stroke();
    }
    if (drawing.background === 'grid') {
      for (let x = spacing; x < INK_WIDTH; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, INK_HEIGHT); ctx.stroke();
      }
    }
  }
  for (const stroke of [...drawing.strokes, ...(active ? [active] : [])]) {
    const points = stroke.points;
    if (!points.length) continue;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = stroke.tool === 'marker' ? 0.27 : 1;
    const base = stroke.size * (stroke.tool === 'marker' ? 3.2 : 1);
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, Math.max(0.6, base * (0.35 + points[0].p * 0.65) / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        ctx.lineWidth = Math.max(0.75, base * (0.35 + (a.p + b.p) * 0.325));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
