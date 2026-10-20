import { describe, expect, it } from 'vitest';
import { skills } from './i7';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('I7 skills', () => {
  it('runs positions → runs from the root → runs from any degree, after the boxes', () => {
    expect(skills.map((s) => s.id)).toEqual(['I7.positions', 'I7.root-runs', 'I7.degree-runs']);
    for (const s of skills) {
      expect(s.topic).toBe('I7');
      expect(s.drillTypes).toEqual(['pentatonic-box']);
      expect(s.order).toBeGreaterThan(getSkill('C7.relative')!.order);
      expect(s.order).toBeLessThan(getSkill('C10.capo-g-c-d')!.order);
    }
  });

  it('gates the positions on the major boxes they fill in (rule 7)', () => {
    expect(getSkill('I7.positions')!.prerequisites).toEqual(['C7.major-boxes']);
    expect(getSkill('I7.positions')!.softUnlock).toBe(false);
    expect(getSkill('I7.root-runs')!.prerequisites).toEqual(['I7.positions']);
    expect(getSkill('I7.degree-runs')!.prerequisites).toEqual(['I7.root-runs']);
  });

  it('has one card per position, then one per position and degree', () => {
    expect(ids('I7.positions')).toEqual([1, 2, 3, 4, 5].map((p) => `scale-position:${p}`));
    expect(ids('I7.root-runs')).toEqual([1, 2, 3, 4, 5].map((p) => `scale-run:${p}@1`));
    const runs = ids('I7.degree-runs');
    expect(runs).toHaveLength(30);
    // A position's runs sit side by side: a wrong start is their confusion (rule 6).
    expect(runs.slice(0, 7)).toEqual([
      'scale-run:1@2',
      'scale-run:1@3',
      'scale-run:1@4',
      'scale-run:1@5',
      'scale-run:1@6',
      'scale-run:1@7',
      'scale-run:2@2',
    ]);
  });
});
