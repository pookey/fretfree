import { describe, expect, it } from 'vitest';
import { flattenPath, footprints, margin } from './footprint';
import { DEFAULT_FRETS, NECK_JOINT_Y, SCALE, boardEnd, boardHalfWidth } from './geometry';
import { BODIES, bodyFor, collectBodies } from './registry';
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

  it('falls back for an unknown shape', () => {
    expect(bodyFor('no-such-shape')).toBe(BODIES.get('stratocaster'));
  });

  describe.each([...BODIES.entries()])('%s', (_id, body) => {
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
  });
});
