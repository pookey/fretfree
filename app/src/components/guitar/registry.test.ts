import { describe, expect, it } from 'vitest';
import { area, flattenPath, footprints, margin } from './footprint';
import { DEFAULT_FRETS, NECK_JOINT_Y, SCALE, boardEnd, boardHalfWidth } from './geometry';
import { BODIES, bodyFor, collectBodies } from './registry';
import { BODY_SHAPES, hasBody } from './shapes';
import type { BodyShape } from './types';

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
const GUARD_SHARE: Record<string, number> = { stratocaster: 0.42, telecaster: 0.22 };
const GUARD_SHARE_MAX = 0.55;
/** Room between the jack plate and the guard, in mm. */
const JACK_CLEARANCE = 8;

describe('body registry', () => {
  it('registers the first three shapes by file name', () => {
    expect([...BODIES.keys()]).toEqual(
      expect.arrayContaining(['stratocaster', 'telecaster', 'les-paul']),
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
    expect(hasBody('sg')).toBe(false);
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
