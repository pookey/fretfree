import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '.';

describe('achievement copy', () => {
  it('never breaks a fret range after its dash (M6-14)', () => {
    const ranges = ACHIEVEMENTS.flatMap((a) => a.description.match(/\d\S*–\S*\d/g) ?? []);
    expect(ranges.length).toBeGreaterThan(0);
    for (const r of ranges) expect(r).toBe('0⁠–⁠12');
    const strings = ACHIEVEMENTS.filter((a) => /^string-\d-master$/.test(a.id));
    expect(strings).toHaveLength(6);
    for (const a of strings) expect(a.description).toMatch(/frets 0⁠–⁠12\.$/);
  });
});
