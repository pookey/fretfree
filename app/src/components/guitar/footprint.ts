import type { BodyShape, Point } from './types';

/**
 * How much room each drawn part takes, in its own frame (before its
 * anchor's translate and rotate). `parts.tsx` draws with these sizes, and
 * the body tests use them to prove every part sits inside its outline.
 */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Ellipse {
  rx: number;
  ry: number;
  /** Offset of the centre, e.g. a knob's drop shadow. */
  dx?: number;
  dy?: number;
}

const box = (hw: number, y0: number, y1: number): Box => ({ x0: -hw, x1: hw, y0, y1 });

export const PICKUP = {
  single: box(37.5, -10.5, 10.5),
  humbucker: box(45, -23, 23),
} as const;

export const BRIDGE = {
  tremolo: box(37, -15, 35),
  plate: box(46, -78, 46),
  'tune-o-matic': box(45.5, -6, 6),
  acoustic: box(78, -18, 20),
} as const;

export const TAILPIECE = {
  stop: box(46, -7, 7),
  trapeze: box(32, -6, 70),
} as const;

export const KNOB: Ellipse = { rx: 11.5, ry: 11.5, dx: 1.5, dy: 2 };
export const TOGGLE: Ellipse = { rx: 10, ry: 10 };
export const BLADE = box(4, -16, 16);
export const JACK: Ellipse = { rx: 8, ry: 8 };
/** A recessed, pointed-oval plate the jack sits in, long along y. */
export const JACK_PLATE: Ellipse = { rx: 11, ry: 19 };

type Placed = { x: number; y: number; angle?: number };

function place(at: Placed, p: Point): Point {
  const a = ((at.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: at.x + p.x * cos - p.y * sin, y: at.y + p.x * sin + p.y * cos };
}

/** Corners and edge midpoints of a box, placed at `at`. */
export function boxPoints(b: Box, at: Placed): Point[] {
  const xs = [b.x0, (b.x0 + b.x1) / 2, b.x1];
  const ys = [b.y0, (b.y0 + b.y1) / 2, b.y1];
  return xs.flatMap((x) => ys.map((y) => place(at, { x, y })));
}

/** 24 points round an ellipse, placed at `at`. */
export function ellipsePoints(e: Ellipse, at: Placed): Point[] {
  return Array.from({ length: 24 }, (_, i) => {
    const t = (i / 24) * 2 * Math.PI;
    return place(at, { x: (e.dx ?? 0) + e.rx * Math.cos(t), y: (e.dy ?? 0) + e.ry * Math.sin(t) });
  });
}

// ---- Paths -----------------------------------------------------------------

/**
 * A path as a polygon: absolute M, L, C and Z only (body files use only
 * these), each curve cut into `steps` straight pieces.
 */
export function flattenPath(d: string, steps = 24): Point[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: Point[] = [];
  let cur: Point = { x: 0, y: 0 };
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      cur = { x: num(), y: num() };
      out.push(cur);
    } else if (cmd === 'C') {
      const [c1, c2, end] = [0, 1, 2].map(() => ({ x: num(), y: num() })) as [Point, Point, Point];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        out.push({
          x: u ** 3 * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * end.x,
          y: u ** 3 * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * end.y,
        });
      }
      cur = end;
    } else if (cmd !== 'Z') {
      throw new Error(`flattenPath: unsupported command ${cmd}`);
    }
  }
  return out;
}

/** Even-odd point-in-polygon. */
export function inside(p: Point, poly: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

/** Distance from `p` to the polygon's nearest edge. */
export function edgeDistance(p: Point, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/** Signed room from `p` to the outline: positive inside, negative outside. */
export function margin(p: Point, poly: readonly Point[]): number {
  return inside(p, poly) ? edgeDistance(p, poly) : -edgeDistance(p, poly);
}

// ---- A body's parts --------------------------------------------------------

export interface Footprint {
  part: string;
  points: Point[];
}

/** Sample points over every part drawn on `body`'s top. */
export function footprints(body: BodyShape): Footprint[] {
  const out: Footprint[] = [];
  body.pickups.forEach((p, i) =>
    out.push({ part: `pickup ${i + 1}`, points: boxPoints(PICKUP[p.type], p) }),
  );
  out.push({ part: 'bridge', points: boxPoints(BRIDGE[body.bridge.type], body.bridge) });
  if (body.tailpiece) {
    out.push({
      part: 'tailpiece',
      points: boxPoints(TAILPIECE[body.tailpiece.type], body.tailpiece),
    });
  }
  const c = body.controls;
  c.knobs.forEach((k, i) => out.push({ part: `knob ${i + 1}`, points: ellipsePoints(KNOB, k) }));
  if (c.switch) {
    out.push({
      part: 'switch',
      points:
        c.switch.type === 'blade' ? boxPoints(BLADE, c.switch) : ellipsePoints(TOGGLE, c.switch),
    });
  }
  if (c.plate) out.push({ part: 'control plate', points: flattenPath(c.plate) });
  if (c.jack) {
    out.push({
      part: 'jack',
      points: ellipsePoints(c.jack.plate ? JACK_PLATE : JACK, c.jack),
    });
  }
  return out;
}
