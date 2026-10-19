import { describe, expect, it } from 'vitest';
import { itemId, parseItemId, parsePentaItemId, pentaItemId } from '../model';
import { skills } from './c7';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('pentatonic item IDs', () => {
  it('builds and parses box and relative cards', () => {
    expect(pentaItemId('penta-box', 1, 'minor')).toBe('penta-box:1@minor');
    expect(pentaItemId('penta-relative', 5, 'major')).toBe('penta-relative:5@major');
    expect(parsePentaItemId('penta-box:3@major')).toEqual({
      kind: 'penta-box',
      box: 3,
      quality: 'major',
    });
    const ref = parseItemId('penta-relative:2@minor');
    expect(ref).toEqual({ kind: 'penta-relative', box: 2, quality: 'minor' });
    expect(itemId(ref!)).toBe('penta-relative:2@minor');
  });

  it('rejects other boxes and qualities', () => {
    expect(() => pentaItemId('penta-box', 6 as never, 'minor')).toThrow(RangeError);
    expect(() => pentaItemId('penta-box', 1, 'dorian' as never)).toThrow(RangeError);
    for (const bad of [
      'penta-box:0@minor',
      'penta-box:6@minor',
      'penta-box:1@dominant7',
      'penta-box:01@minor',
      'penta:1@minor',
      'penta-relative:1',
    ]) {
      expect(parsePentaItemId(bad), bad).toBeNull();
    }
  });
});

describe('C7 skills', () => {
  it('runs minor boxes → major boxes → the relative link, after CAGED', () => {
    expect(skills.map((s) => s.id)).toEqual(['C7.minor-boxes', 'C7.major-boxes', 'C7.relative']);
    for (const s of skills) {
      expect(s.topic).toBe('C7');
      expect(s.drillTypes).toEqual(['pentatonic-box']);
      expect(s.order).toBeGreaterThan(getSkill('C6.dominant7-shapes')!.order);
    }
  });

  it('gates the first box on the minor CAGED shapes it wraps (rule 7)', () => {
    const first = getSkill('C7.minor-boxes')!;
    expect(first.prerequisites).toEqual(['C6.minor-shapes']);
    expect(first.softUnlock).toBe(false);
    expect(getSkill('C7.major-boxes')!.prerequisites).toEqual(['C7.minor-boxes']);
    expect(getSkill('C7.relative')!.prerequisites).toEqual(['C7.minor-boxes', 'C7.major-boxes']);
  });

  it('has one card per box, in chain order', () => {
    expect(ids('C7.minor-boxes')).toEqual([1, 2, 3, 4, 5].map((b) => `penta-box:${b}@minor`));
    expect(ids('C7.major-boxes')).toEqual([1, 2, 3, 4, 5].map((b) => `penta-box:${b}@major`));
  });

  it('pairs each minor box with the major box of the same fingering (rule 6)', () => {
    expect(ids('C7.relative')).toEqual([
      'penta-relative:1@minor',
      'penta-relative:5@major',
      'penta-relative:2@minor',
      'penta-relative:1@major',
      'penta-relative:3@minor',
      'penta-relative:2@major',
      'penta-relative:4@minor',
      'penta-relative:3@major',
      'penta-relative:5@minor',
      'penta-relative:4@major',
    ]);
  });
});
