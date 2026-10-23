import { describe, expect, it } from 'vitest';
import { area, flattenPath, footprints, margin } from './footprint';
import { DEFAULT_FRETS, NECK_JOINT_Y, SCALE, boardEnd, boardHalfWidth } from './geometry';
import { BODIES, bodyFor, collectBodies } from './registry';
import { BODY_SHAPES, hasBody } from './shapes';
import type { BodyShape, Point } from './types';

/** Every coordinate pair in a path, control points too: a slightly generous bounding box. */
function bbox(d: string) {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Room between a part's drawn edge and the body's edge, in mm. */
const MIN_MARGIN = 4;
/** A pickguard follows the edge more closely. */
const GUARD_MARGIN = 3;
/**
 * How much of the top a guard may cover: the real part's share for the
 * models that have a big one, and the user's outer bound for every body.
 */
// The area counts what is hidden under the board and the bridge plate too:
// the visible shares are about 0.40 (Strat) and 0.19 (Tele). A Jazzmaster's
// guard is the largest, an SG's batwing about a third of the top.
const GUARD_SHARE: Record<string, number> = {
  stratocaster: 0.45,
  telecaster: 0.24,
  sg: 0.34,
  jazzmaster: 0.53,
  'es-335': 0.1,
};
const GUARD_SHARE_MAX = 0.55;
/**
 * Guards that must read as smooth curves: no visible edge tighter than
 * this radius, in mm. The Les Paul guard has a deliberate point.
 */
const SMOOTH_GUARDS = ['stratocaster', 'telecaster', 'sg', 'jazzmaster', 'es-335'];
const MIN_GUARD_RADIUS = 7;

type Cubic = [Point, Point, Point, Point];

/** The cubic segments of an absolute `M … C … Z` path. */
function cubics(d: string): Cubic[] {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
  const out: Cubic[] = [];
  for (let i = 0; i + 3 < pts.length; i += 3)
    out.push([pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!]);
  return out;
}

/** Radius of curvature |B'|³ / |B' × B''| and the point, at `t` along a cubic. */
function radiusAt([p0, p1, p2, p3]: Cubic, t: number): { r: number; p: Point } {
  const u = 1 - t;
  const d1 = (k: 'x' | 'y') =>
    3 * u * u * (p1[k] - p0[k]) + 6 * u * t * (p2[k] - p1[k]) + 3 * t * t * (p3[k] - p2[k]);
  const d2 = (k: 'x' | 'y') =>
    6 * u * (p2[k] - 2 * p1[k] + p0[k]) + 6 * t * (p3[k] - 2 * p2[k] + p1[k]);
  const at = (k: 'x' | 'y') =>
    u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k];
  const cross = Math.abs(d1('x') * d2('y') - d1('y') * d2('x'));
  const speed = Math.hypot(d1('x'), d1('y'));
  return { r: cross === 0 ? Infinity : speed ** 3 / cross, p: { x: at('x'), y: at('y') } };
}

/**
 * The bounding box of a footprint's sample points, grown by `pad`.
 * (`boxPoints` gives a grid, not an ordered polygon, so `inside` can't be used.)
 */
function bounds(points: readonly Point[], pad: number) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    has: (p: Point) =>
      p.x >= Math.min(...xs) - pad &&
      p.x <= Math.max(...xs) + pad &&
      p.y >= Math.min(...ys) - pad &&
      p.y <= Math.max(...ys) + pad,
  };
}

/** Room between the jack plate and the guard, in mm. */
const JACK_CLEARANCE = 8;

describe('body registry', () => {
  it('registers the electric shapes by file name', () => {
    expect([...BODIES.keys()]).toEqual(
      expect.arrayContaining([
        'stratocaster',
        'telecaster',
        'les-paul',
        'sg',
        'jazzmaster',
        'es-335',
        'superstrat',
      ]),
    );
  });

  it('refuses a body file without a default export', () => {
    expect(() => collectBodies({ './bodies/x.ts': undefined as unknown as BodyShape })).toThrow(
      /bodies\/x\.ts/,
    );
  });

  it('lists the drawn shapes without loading them', () => {
    expect([...BODY_SHAPES].sort()).toEqual([...BODIES.keys()].sort());
    expect(hasBody('les-paul')).toBe(true);
    expect(hasBody('sg')).toBe(true);
    expect(hasBody('no-such-shape')).toBe(false);
  });

  it('falls back for an unknown shape', () => {
    expect(bodyFor('no-such-shape')).toBe(BODIES.get('stratocaster'));
  });

  describe.each([...BODIES.entries()])('%s', (id, body) => {
    const box = bbox(body.outline);

    it('is a closed outline about 13 inches wide and 15 to 19 long', () => {
      expect(body.outline.trim()).toMatch(/^M .* Z$/);
      expect(box.maxX - box.minX).toBeGreaterThan(290);
      expect(box.maxX - box.minX).toBeLessThan(420);
      expect(box.maxY - box.minY).toBeGreaterThan(370);
      expect(box.maxY - box.minY).toBeLessThan(500);
    });

    it('shares the neck joint and scale length', () => {
      expect(body.neckJoint.y).toBeCloseTo(NECK_JOINT_Y);
      expect(body.bridge.y).toBe(SCALE);
      expect(body.bridge.x).toBe(0);
    });

    const outline = flattenPath(body.outline);

    it.each(footprints(body).map((f) => [f.part, f] as const))(
      'keeps its %s fully on the top, at least 4 mm in',
      (_part, f) => {
        const worst = Math.min(...f.points.map((p) => margin(p, outline)));
        expect(worst).toBeGreaterThanOrEqual(MIN_MARGIN);
      },
    );

    it('keeps its pickups between the neck and the bridge', () => {
      for (const p of body.pickups) {
        expect(p.y).toBeGreaterThan(boardEnd(body.frets ?? DEFAULT_FRETS));
        expect(p.y).toBeLessThan(body.bridge.y);
      }
    });

    it('keeps its pickguard inside the outline, except under the neck', () => {
      if (!body.pickguard) return;
      const end = boardEnd(body.frets ?? DEFAULT_FRETS);
      const exposed = flattenPath(body.pickguard).filter(
        (p) => !(p.y <= end && Math.abs(p.x) <= boardHalfWidth(p.y) + 2),
      );
      expect(exposed.length).toBeGreaterThan(10);
      const worst = Math.min(...exposed.map((p) => margin(p, outline)));
      expect(worst).toBeGreaterThanOrEqual(GUARD_MARGIN);
    });

    it('covers no more of the top than the real guard does', () => {
      if (!body.pickguard) return;
      const share = area(flattenPath(body.pickguard)) / area(outline);
      expect(share).toBeLessThanOrEqual(GUARD_SHARE[id] ?? GUARD_SHARE_MAX);
      expect(share).toBeLessThanOrEqual(GUARD_SHARE_MAX);
    });

    it('leaves the lower bass bout bare below the bridge', () => {
      if (!body.pickguard) return;
      const bass = flattenPath(body.pickguard).filter((p) => p.x < 0);
      expect(Math.max(...bass.map((p) => p.y))).toBeLessThan(body.bridge.y + 30);
    });

    it('draws its pickguard as cubic curves only', () => {
      if (!body.pickguard) return;
      expect(body.pickguard).toMatch(/^M [-\d. ]+( C [-\d. ]+)+ Z$/);
    });

    it.runIf(SMOOTH_GUARDS.includes(id))(
      `bends its visible pickguard edge no tighter than ${MIN_GUARD_RADIUS} mm`,
      () => {
        const end = boardEnd(body.frets ?? DEFAULT_FRETS);
        const covers = footprints(body)
          .filter((f) => f.part === 'bridge' || f.part.startsWith('pickup'))
          .map((f) => bounds(f.points, 3));
        let worst = { r: Infinity, p: { x: 0, y: 0 } };
        for (const c of cubics(body.pickguard!)) {
          for (let t = 0; t <= 1.0001; t += 0.02) {
            const s = radiusAt(c, Math.min(t, 1));
            const hidden =
              (s.p.y <= end && Math.abs(s.p.x) <= boardHalfWidth(s.p.y) + 2) ||
              covers.some((b) => b.has(s.p));
            if (!hidden && s.r < worst.r) worst = s;
          }
        }
        expect(
          worst.r,
          `at ${worst.p.x.toFixed(0)}, ${worst.p.y.toFixed(0)}`,
        ).toBeGreaterThanOrEqual(MIN_GUARD_RADIUS);
      },
    );

    it('keeps its jack clear of the guard', () => {
      const jack = footprints(body).find((f) => f.part === 'jack');
      if (!jack || !body.pickguard) return;
      const guard = flattenPath(body.pickguard);
      // Negative margin: outside the guard, by that much.
      expect(Math.max(...jack.points.map((p) => margin(p, guard)))).toBeLessThanOrEqual(
        -JACK_CLEARANCE,
      );
    });

    it('keeps its pickguard out of the horns, below the neck joint', () => {
      if (!body.pickguard) return;
      const end = boardEnd(body.frets ?? DEFAULT_FRETS);
      const exposed = flattenPath(body.pickguard).filter(
        (p) => !(p.y <= end && Math.abs(p.x) <= boardHalfWidth(p.y) + 2),
      );
      expect(Math.min(...exposed.map((p) => p.y))).toBeGreaterThan(body.neckJoint.y - 10);
    });
  });
});
