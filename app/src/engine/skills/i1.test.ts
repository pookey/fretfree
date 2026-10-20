import { describe, expect, it } from 'vitest';
import { skills } from './i1';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('I1 skills', () => {
  it('runs major before minor, top string sets before low ones, after C7', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'I1.major-top-sets',
      'I1.major-low-sets',
      'I1.minor-top-sets',
      'I1.minor-low-sets',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('I1');
      expect(s.drillTypes).toEqual(['triad-inversions']);
      expect(s.order).toBeGreaterThan(getSkill('C7.relative')!.order);
      expect(s.order).toBeLessThan(getSkill('C10.capo-g-c-d')!.order);
    }
  });

  it('gates the first set on the CAGED triad cores (rule 7)', () => {
    const first = getSkill('I1.major-top-sets')!;
    expect(first.prerequisites).toEqual(['C6.triad-cores']);
    expect(first.softUnlock).toBe(false);
    expect(getSkill('I1.minor-top-sets')!.prerequisites).toContain('C6.minor-cores');
    expect(getSkill('I1.minor-low-sets')!.prerequisites).toEqual([
      'I1.major-low-sets',
      'I1.minor-top-sets',
    ]);
  });

  it('builds each inversion on a set, then names them, one set at a time', () => {
    expect(ids('I1.major-top-sets')).toEqual([
      'inversion:0@s3/major',
      'inversion:1@s3/major',
      'inversion:2@s3/major',
      'inversion-name:0@s3/major',
      'inversion-name:1@s3/major',
      'inversion-name:2@s3/major',
      'inversion:0@s4/major',
      'inversion:1@s4/major',
      'inversion:2@s4/major',
      'inversion-name:0@s4/major',
      'inversion-name:1@s4/major',
      'inversion-name:2@s4/major',
    ]);
    expect(ids('I1.minor-low-sets')[0]).toBe('inversion:0@s5/minor');
    expect(ids('I1.minor-low-sets').at(-1)).toBe('inversion-name:2@s6/minor');
  });

  it('covers every inversion of both qualities on all four string sets once', () => {
    const all = skills.flatMap((s) => s.items().map((i) => i.id));
    expect(all).toHaveLength(2 * 3 * 4 * 2);
    expect(new Set(all).size).toBe(all.length);
  });
});
