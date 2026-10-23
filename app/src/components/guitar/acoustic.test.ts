import { describe, expect, it } from 'vitest';
import { circlePath, rosetteEdge, soundholeDetails } from './acoustic';
import { flattenPath } from './footprint';

describe('acoustic soundholes', () => {
  it('draws a circle as a closed cubic path of the right radius', () => {
    const d = circlePath(0, 500, 40);
    expect(d).toMatch(/^M [-\d. ]+( C [-\d. ]+)+ Z$/);
    for (const p of flattenPath(d)) expect(Math.hypot(p.x, p.y - 500)).toBeCloseTo(40, 0);
  });

  it('puts the rosette round the opening, its outer edge where a guard may follow it', () => {
    const hole = { y: 490, r: 42, rosette: 7, gap: 3 };
    const [rosette, opening] = soundholeDetails(hole);
    expect(opening).toMatchObject({ paint: 'hole' });
    expect(rosette).toMatchObject({ paint: 'rosette', width: 7 });
    const ring = flattenPath(rosette!.d).map((p) => Math.hypot(p.x, p.y - 490));
    expect(Math.min(...ring) - 3.5).toBeGreaterThan(hole.r);
    expect(rosetteEdge(hole)).toBe(52);
    expect(Math.max(...ring) + 3.5).toBeCloseTo(52, 0);
  });
});
