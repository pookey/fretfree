import { flattenPath } from './footprint';
import type { Point } from './types';

/**
 * Drawing body outlines from dimensions, not by eye: each body file lists
 * points taken from its dimension table, `smoothClosed` fits one smooth
 * closed curve through them, and the pickguard and edge hardware are
 * placed by insetting from that curve, so no part can end up off the body.
 */

export type Pt = readonly [x: number, y: number];

export const INCH = 25.4;

const f = (v: number) => String(Math.round(v * 10) / 10);

/**
 * A closed curve through every point, in order (a Catmull-Rom spline as
 * cubic Béziers). Each point's tangent runs parallel to the chord of its
 * neighbours, so the curve has no corners.
 */
export function smoothClosed(points: readonly Pt[]): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n]!;
  const parts = [`M ${f(at(0)[0])} ${f(at(0)[1])}`];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(`C ${f(c1[0]!)} ${f(c1[1]!)} ${f(c2[0]!)} ${f(c2[1]!)} ${f(p2[0])} ${f(p2[1])}`);
  }
  return `${parts.join(' ')} Z`;
}

export type Side = 'bass' | 'treble';

interface EdgeHit {
  point: Point;
  /** Unit tangent of the edge there, pointing down the body (y growing). */
  tangent: Point;
}

/** Where the outline's outermost edge on `side` crosses height `y`. */
export function edgeAt(outline: string, side: Side, y: number): EdgeHit {
  const poly = flattenPath(outline);
  let best: EdgeHit | null = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    if (a.y > y === b.y > y) continue;
    const x = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (side === 'bass' ? x >= 0 : x <= 0) continue;
    if (best && (side === 'bass' ? x >= best.point.x : x <= best.point.x)) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const s = b.y > a.y ? 1 : -1;
    best = { point: { x, y }, tangent: { x: (s * (b.x - a.x)) / len, y: (s * (b.y - a.y)) / len } };
  }
  if (!best) throw new Error(`the outline doesn't reach y = ${y} on the ${side} side`);
  return best;
}

/** The point `d` mm in from the `side` edge at height `y`, along the edge's normal. */
export function inset(outline: string, side: Side, y: number, d: number): Pt {
  const { point, tangent } = edgeAt(outline, side, y);
  // The inward normal: the tangent turned towards the centre line.
  const sign = side === 'bass' ? 1 : -1;
  return [point.x + sign * tangent.y * d, point.y - sign * tangent.x * d];
}

/** Degrees that turn a part's long (y) axis to run along the edge at `y`. */
export function edgeAngle(outline: string, side: Side, y: number): number {
  const { tangent } = edgeAt(outline, side, y);
  return (Math.atan2(-tangent.x, tangent.y) * 180) / Math.PI;
}

/**
 * A rounded slot from `a` to `b`, `r` wide each side (a control plate),
 * as a path of lines and quarter-circle Béziers.
 */
export function stadium(a: Pt, b: Pt, r: number): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as const;
  const n = [-u[1], u[0]] as const;
  const k = 0.5523 * r;
  const p = (c: Pt, su: number, sn: number) =>
    `${f(c[0] + u[0] * su + n[0] * sn)} ${f(c[1] + u[1] * su + n[1] * sn)}`;
  return [
    `M ${p(a, 0, r)}`,
    `L ${p(b, 0, r)}`,
    `C ${p(b, k, r)} ${p(b, r, k)} ${p(b, r, 0)}`,
    `C ${p(b, r, -k)} ${p(b, k, -r)} ${p(b, 0, -r)}`,
    `L ${p(a, 0, -r)}`,
    `C ${p(a, -k, -r)} ${p(a, -r, -k)} ${p(a, -r, 0)}`,
    `C ${p(a, -r, k)} ${p(a, -k, r)} ${p(a, 0, r)}`,
    'Z',
  ].join(' ');
}

/** The point `t` (0 to 1) of the way from `a` to `b`. */
export function along(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
