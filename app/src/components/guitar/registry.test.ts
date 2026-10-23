import { describe, expect, it } from 'vitest';
import { NECK_JOINT_Y, SCALE } from './geometry';
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

describe('body registry', () => {
  it('registers the first three shapes by file name', () => {
    expect([...BODIES.keys()]).toEqual(
      expect.arrayContaining(['s-style', 't-style', 'single-cut']),
    );
  });

  it('refuses a body file without a default export', () => {
    expect(() => collectBodies({ './bodies/x.ts': undefined as unknown as BodyShape })).toThrow(
      /bodies\/x\.ts/,
    );
  });

  it('falls back for an unknown shape', () => {
    expect(bodyFor('no-such-shape')).toBe(BODIES.get('s-style'));
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

    it('puts its hardware on the body', () => {
      const points = [
        body.bridge,
        ...body.pickups,
        ...body.controls.knobs,
        ...(body.tailpiece ? [body.tailpiece] : []),
        ...(body.controls.switch ? [body.controls.switch] : []),
      ];
      for (const p of points) {
        expect(p.x).toBeGreaterThan(box.minX);
        expect(p.x).toBeLessThan(box.maxX);
        expect(p.y).toBeGreaterThan(body.neckJoint.y);
        expect(p.y).toBeLessThan(box.maxY);
      }
      for (const p of body.pickups) expect(p.y).toBeLessThan(body.bridge.y);
    });

    it('keeps its pickguard inside the outline box', () => {
      if (!body.pickguard) return;
      const guard = bbox(body.pickguard);
      expect(guard.minX).toBeGreaterThanOrEqual(box.minX);
      expect(guard.maxX).toBeLessThanOrEqual(box.maxX);
      expect(guard.minY).toBeGreaterThanOrEqual(box.minY);
      expect(guard.maxY).toBeLessThanOrEqual(box.maxY);
    });
  });
});
