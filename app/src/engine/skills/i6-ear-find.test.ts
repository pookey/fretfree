import { describe, expect, it } from 'vitest';
import { parseEarFindItemId } from '../items/ear-find';
import { getSkill } from './index';
import { EAR_FIND_ORDER, EAR_FIND_SKILL, skills } from './i6-ear-find';

const skill = skills[0]!;
const ids = skill.items().map((i) => i.id);

describe('I6 ear → fretboard skill', () => {
  it('holds one ear-find card per note on each string', () => {
    expect(ids).toHaveLength(12 * 6);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => parseEarFindItemId(id) !== null)).toBe(true);
    expect(skill.items().every((i) => i.skillId === EAR_FIND_SKILL)).toBe(true);
    expect(new Set(EAR_FIND_ORDER).size).toBe(12);
  });

  it('introduces cards by interval over the open string, low E first', () => {
    // A 4th above each open string, from string 6 up, then the 5ths.
    expect(ids.slice(0, 7)).toEqual([
      'ear-find:A@s6',
      'ear-find:D@s5',
      'ear-find:G@s4',
      'ear-find:C@s3',
      'ear-find:E@s2',
      'ear-find:A@s1',
      'ear-find:B@s6',
    ]);
    // The octave is the open string's own note (D15 plays it at fret 12).
    expect(ids.slice(12, 14)).toEqual(['ear-find:E@s6', 'ear-find:A@s5']);
  });

  it('opens early, alongside the fretboard path, and only D15 serves it', () => {
    expect(skill).toMatchObject({
      topic: 'I6',
      prerequisites: ['F2.string6-naturals'],
      softUnlock: true,
      skipPlacement: true,
      drillTypes: ['hear-it-find-it'],
    });
    expect(getSkill(EAR_FIND_SKILL)).toBe(skill);
    for (const p of skill.prerequisites) expect(getSkill(p), p).toBeDefined();
  });
});
