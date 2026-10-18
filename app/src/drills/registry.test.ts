import { describe, expect, it } from 'vitest';
import { SKILLS } from '../engine/skills';
import { DRILLS, getDrill } from './registry';

describe('drill registry', () => {
  it('has unique IDs and resolves by ID', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    expect(getDrill('name-the-note')?.title).toMatch(/highlighted/);
    expect(getDrill('nope')).toBeUndefined();
  });

  it('can test every item of every skill that names it', () => {
    for (const skill of SKILLS) {
      for (const drillId of skill.drillTypes) {
        const drill = getDrill(drillId);
        expect(drill, `${skill.id} → ${drillId}`).toBeDefined();
        expect(drill!.skills).toContain(skill.id);
        for (const item of skill.items()) expect(drill!.canTest(item)).toBe(true);
      }
    }
  });
});
