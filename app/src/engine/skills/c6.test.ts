import { describe, expect, it } from 'vitest';
import { cagedItemId, itemId, parseCagedItemId, parseItemId } from '../model';
import { skills } from './c6';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('CAGED item IDs', () => {
  it('builds and parses shape and triad-core cards', () => {
    expect(cagedItemId('caged', 'A', 'major')).toBe('caged:A-shape@major');
    expect(cagedItemId('caged-core', 'G', 'minor')).toBe('caged-core:G-shape@minor');
    expect(parseCagedItemId('caged:D-shape@dominant7')).toEqual({
      kind: 'caged',
      shape: 'D',
      quality: 'dominant7',
    });
    const ref = parseItemId('caged-core:C-shape@major');
    expect(ref).toEqual({ kind: 'caged-core', shape: 'C', quality: 'major' });
    expect(itemId(ref!)).toBe('caged-core:C-shape@major');
  });

  it('rejects other shapes, qualities and a dominant-7 core', () => {
    expect(() => cagedItemId('caged', 'B' as never, 'major')).toThrow(RangeError);
    expect(() => cagedItemId('caged', 'A', 'sus4' as never)).toThrow(RangeError);
    // A 7 shape's triad core is the major core, so it is not a fact of its own.
    expect(() => cagedItemId('caged-core', 'A', 'dominant7')).toThrow(RangeError);
    for (const bad of [
      'caged-core:A-shape@dominant7',
      'caged:B-shape@major',
      'caged:A@major',
      'caged:A-shape@maj',
      'caged:A-shape:root=C',
    ]) {
      expect(parseCagedItemId(bad), bad).toBeNull();
    }
  });
});

describe('C6 skills', () => {
  it('runs triad cores → whole shapes, major → minor → dominant 7', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'C6.triad-cores',
      'C6.major-shapes',
      'C6.minor-cores',
      'C6.minor-shapes',
      'C6.dominant7-shapes',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('C6');
      expect(s.drillTypes).toEqual(['build-caged']);
    }
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('gates the first CAGED skill on mastered natural notes (rule 7)', () => {
    const first = getSkill('C6.triad-cores')!;
    expect(first.prerequisites).toEqual(['F2.string6-naturals', 'F2.string5-naturals']);
    expect(first.softUnlock).toBe(false);
    expect(getSkill('C6.major-shapes')!.prerequisites).toEqual(['C6.triad-cores']);
    expect(getSkill('C6.minor-shapes')!.prerequisites).toEqual([
      'C6.major-shapes',
      'C6.minor-cores',
    ]);
    expect(getSkill('C6.dominant7-shapes')!.prerequisites).toContain('C3.sevenths');
  });

  it('has one card per shape in chain order, so C and A sit side by side', () => {
    expect(ids('C6.triad-cores')).toEqual([
      'caged-core:C-shape@major',
      'caged-core:A-shape@major',
      'caged-core:G-shape@major',
      'caged-core:E-shape@major',
      'caged-core:D-shape@major',
    ]);
    expect(ids('C6.major-shapes')[1]).toBe('caged:A-shape@major');
    expect(ids('C6.minor-cores')).toContain('caged-core:E-shape@minor');
    expect(ids('C6.minor-shapes')).toContain('caged:C-shape@minor');
    expect(ids('C6.dominant7-shapes')).toContain('caged:G-shape@dominant7');
    for (const s of skills) expect(s.items()).toHaveLength(5);
  });
});
