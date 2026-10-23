import { describe, expect, it } from 'vitest';
import { area, flattenPath, footprints, margin } from './footprint';
import { DEFAULT_FRETS, NECK_JOINT_Y, SCALE, boardEnd, boardHalfWidth, fretY } from './geometry';
import { neckHalfWidth } from './Neck';
import { BODIES, bodyFor, collectBodies } from './registry';
import { BODY_SHAPES, GUARDLESS_SHAPES, hasBody } from './shapes';
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
  'es-335': 0.08,
  // An acoustic's teardrop is a small part beside the soundhole.
  dreadnought: 0.07,
  jumbo: 0.07,
  concert: 0.07,
  parlour: 0.07,
};
const GUARD_SHARE_MAX = 0.55;
/**
 * Guards that must read as smooth curves: no visible edge tighter than
 * this radius, in mm. The Les Paul guard has a deliberate point.
 */
const SMOOTH_GUARDS = [
  'stratocaster',
  'telecaster',
  'sg',
  'jazzmaster',
  'es-335',
  'dreadnought',
  'jumbo',
  'concert',
  'parlour',
];
/** Acoustic bodies, and the fret at which each body meets its neck. */
const ACOUSTIC_JOINT: Record<string, 12 | 14> = {
  dreadnought: 14,
  jumbo: 14,
  concert: 14,
  parlour: 12,
  classical: 12,
};
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
/** Room between the guard's edge and a hole in the top, or a control beside the guard. */
const EDGE_CLEARANCE = 3;

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
        'dreadnought',
        'jumbo',
        'parlour',
        'concert',
        'classical',
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

  it('lists, without loading them, exactly the bodies drawn without a guard', () => {
    const guardless = [...BODIES].filter(([, b]) => !b.pickguard).map(([id]) => id);
    expect([...GUARDLESS_SHAPES].sort()).toEqual(guardless.sort());
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

    it('shares the scale length, and the neck joint unless it is an acoustic', () => {
      const joint = ACOUSTIC_JOINT[id];
      expect(body.neckJoint.y).toBeCloseTo(joint ? fretY(joint) : NECK_JOINT_Y);
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

    it('keeps every hole in the top clear of the guard', () => {
      const holes = (body.details ?? []).filter((d) => d.paint === 'hole');
      if (!body.pickguard || !holes.length) return;
      const guard = flattenPath(body.pickguard);
      for (const h of holes) {
        // Negative margin: outside the guard, by that much.
        expect(Math.max(...flattenPath(h.d).map((p) => margin(p, guard)))).toBeLessThanOrEqual(
          -EDGE_CLEARANCE,
        );
      }
    });

    it('puts each knob and switch fully on the guard or clear of its edge', () => {
      if (!body.pickguard) return;
      const guard = flattenPath(body.pickguard);
      for (const f of footprints(body).filter((f) => /^(knob|switch)/.test(f.part))) {
        const m = f.points.map((p) => margin(p, guard));
        const on = Math.min(...m) >= 0;
        const clear = Math.max(...m) <= -EDGE_CLEARANCE;
        expect(on || clear, `${f.part} straddles the guard's edge`).toBe(true);
      }
    });

    it.runIf(id in ACOUSTIC_JOINT)(
      'is an acoustic: its body starts at its 12th or 14th fret, with a soundhole and no electronics',
      () => {
        // The top of the body on the centre line is the neck joint.
        const top = Math.min(...outline.filter((p) => Math.abs(p.x) < 4).map((p) => p.y));
        expect(top).toBeCloseTo(body.neckJoint.y, 0);
        expect(body.pickups).toHaveLength(0);
        expect(body.controls.knobs).toHaveLength(0);
        expect(body.controls.switch ?? body.controls.jack ?? body.controls.plate).toBeUndefined();
        expect(body.tailpiece).toBeUndefined();
        expect(['acoustic', 'tie-block']).toContain(body.bridge.type);
        expect(body.neck).toMatch(/^(acoustic|classical)$/);
        const paints = (body.details ?? []).map((d) => d.paint);
        expect(paints).toEqual(expect.arrayContaining(['hole', 'rosette']));
        // The soundhole sits on the top, below the board's end, and clear of the bridge.
        const hole = flattenPath(body.details!.find((d) => d.paint === 'hole')!.d);
        const end = boardEnd(body.frets ?? DEFAULT_FRETS);
        expect(Math.min(...hole.map((p) => p.y))).toBeGreaterThan(end);
        expect(Math.max(...hole.map((p) => p.y))).toBeLessThan(body.bridge.y - 40);
        expect(Math.min(...hole.map((p) => margin(p, outline)))).toBeGreaterThan(MIN_MARGIN);
      },
    );

    it.runIf(id in ACOUSTIC_JOINT && !!body.pickguard)(
      'puts its teardrop guard beside the soundhole, on the treble side',
      () => {
        const guard = flattenPath(body.pickguard!);
        const hole = flattenPath(body.details!.find((d) => d.paint === 'hole')!.d);
        const holeY = (Math.min(...hole.map((p) => p.y)) + Math.max(...hole.map((p) => p.y))) / 2;
        const cx = guard.reduce((a, p) => a + p.x, 0) / guard.length;
        const cy = guard.reduce((a, p) => a + p.y, 0) / guard.length;
        expect(cx).toBeGreaterThan(40);
        expect(Math.abs(cy - holeY)).toBeLessThan(60);
        // Its point is up by the board, its broad end below the soundhole.
        const tip = guard.reduce((a, p) => (p.y < a.y ? p : a));
        const foot = guard.reduce((a, p) => (p.y > a.y ? p : a));
        expect(tip.y).toBeLessThan(holeY - 40);
        expect(foot.y).toBeGreaterThan(holeY + 40);
        // Clear of the board beside it.
        for (const p of guard.filter((q) => q.y <= boardEnd(body.frets ?? DEFAULT_FRETS))) {
          expect(p.x).toBeGreaterThan(neckHalfWidth(body.neck ?? 'electric', p.y) + 2);
        }
      },
    );

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
