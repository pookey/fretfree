import { describe, expect, it } from 'vitest';
import { crossesGBShift, midiAt, octaveOnString } from '../../theory';
import { itemId, octaveItemId, parseItemId, parseOctaveItemId } from '../model';
import { octaveShapeOffset, skills } from './c1';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const refs = (skillId: string) => ids(skillId).map((id) => parseOctaveItemId(id)!);

const pairsOf = (skillId: string) =>
  [...new Set(refs(skillId).map((r) => `${r.from.string}→${r.string}`))].sort();

describe('octave item IDs', () => {
  it('formats and parses the canonical form', () => {
    expect(octaveItemId({ string: 6, fret: 5 }, 4)).toBe('octave:s6f5→s4');
    expect(parseOctaveItemId('octave:s3f12→s1')).toEqual({
      from: { string: 3, fret: 12 },
      string: 1,
    });
    expect(parseItemId('octave:s6f0→s4')).toEqual({
      kind: 'octave',
      from: { string: 6, fret: 0 },
      string: 4,
    });
    expect(itemId({ kind: 'octave', from: { string: 4, fret: 7 }, string: 2 })).toBe(
      'octave:s4f7→s2',
    );
  });

  it('rejects non-canonical forms', () => {
    for (const bad of ['octave:s6f05→s4', 'octave:s6f5->s4', 'octave:s6f5', 'octave:s6f5→4']) {
      expect(parseOctaveItemId(bad), bad).toBeNull();
      expect(parseItemId(bad), bad).toBeNull();
    }
    expect(() => octaveItemId({ string: 6, fret: -1 }, 4)).toThrow(RangeError);
  });
});

describe('octave shape offsets', () => {
  it('gives the fret move of each shape, with the G–B shift', () => {
    expect(octaveShapeOffset(6, 4)).toBe(2);
    expect(octaveShapeOffset(5, 3)).toBe(2);
    expect(octaveShapeOffset(4, 2)).toBe(3);
    expect(octaveShapeOffset(3, 1)).toBe(3);
    expect(octaveShapeOffset(6, 3)).toBe(-3);
    expect(octaveShapeOffset(5, 2)).toBe(-2);
    expect(octaveShapeOffset(4, 1)).toBe(-2);
    expect(octaveShapeOffset(6, 1)).toBe(0);
  });

  it('mirrors when the shape runs down the strings', () => {
    expect(octaveShapeOffset(4, 6)).toBe(-2);
    expect(octaveShapeOffset(2, 4)).toBe(-3);
    expect(octaveShapeOffset(1, 6)).toBe(0);
  });
});

describe('C1 skills', () => {
  it('registers three skills, soft-gated on F2', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'C1.octaves',
      'C1.octaves-gb-shift',
      'C1.double-octaves',
    ]);
    for (const s of skills) {
      expect(getSkill(s.id)).toBe(s);
      expect(s.topic).toBe('C1');
      expect(s.softUnlock).toBe(true);
      expect(s.drillTypes).toEqual(['octave-finder']);
    }
    expect(getSkill('C1.octaves')!.prerequisites).toEqual([
      'F2.string6-naturals',
      'F2.string5-naturals',
    ]);
    expect(getSkill('C1.octaves-gb-shift')!.prerequisites).toEqual(['C1.octaves']);
    expect(getSkill('C1.double-octaves')!.prerequisites).toEqual(['C1.octaves']);
  });

  it('includes the acceptance example', () => {
    expect(ids('C1.octaves')).toContain('octave:s6f5→s4');
  });

  it('keeps the shapes that avoid the G–B pair apart from the shifted ones', () => {
    expect(pairsOf('C1.octaves')).toEqual(['3→5', '3→6', '4→6', '5→3', '6→3', '6→4']);
    expect(pairsOf('C1.octaves-gb-shift')).toEqual([
      '1→3',
      '1→4',
      '2→4',
      '2→5',
      '3→1',
      '4→1',
      '4→2',
      '5→2',
    ]);
    expect(pairsOf('C1.double-octaves')).toEqual(['1→6', '6→1']);
    for (const r of refs('C1.octaves')) expect(crossesGBShift(r.from.string, r.string)).toBe(false);
    for (const r of refs('C1.octaves-gb-shift')) {
      expect(crossesGBShift(r.from.string, r.string)).toBe(true);
    }
  });

  it('runs every shape both ways (bidirectional cards)', () => {
    for (const s of skills) {
      const all = new Set(s.items().map((i) => i.id));
      for (const r of refs(s.id)) {
        const target = octaveOnString(r.from, r.string)!;
        expect(all, `${octaveItemId(r.from, r.string)} reversed`).toContain(
          octaveItemId(target, r.from.string),
        );
      }
    }
  });

  it('resolves every item to its shape, an octave away, within frets 0–12', () => {
    for (const s of skills) {
      for (const r of refs(s.id)) {
        const target = octaveOnString(r.from, r.string);
        expect(target, octaveItemId(r.from, r.string)).not.toBeNull();
        expect(target!.fret - r.from.fret).toBe(octaveShapeOffset(r.from.string, r.string));
        expect(r.from.fret).toBeGreaterThanOrEqual(0);
        expect(target!.fret).toBeLessThanOrEqual(12);
        const diff = Math.abs(midiAt(target!) - midiAt(r.from));
        expect(diff).toBe(s.id === 'C1.double-octaves' ? 24 : 12);
      }
    }
  });

  it('covers every fret of 0–12 where the shape fits', () => {
    // +2 from string 6 fits frets 0–10; −3 from string 6 to 3 fits frets 3–12.
    const from = (skillId: string, a: number, b: number) =>
      refs(skillId)
        .filter((r) => r.from.string === a && r.string === b)
        .map((r) => r.from.fret);
    expect(from('C1.octaves', 6, 4)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(from('C1.octaves', 6, 3)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(from('C1.octaves-gb-shift', 2, 4)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(from('C1.double-octaves', 6, 1)).toHaveLength(13);
    expect(ids('C1.octaves')).toHaveLength(64);
    expect(ids('C1.octaves-gb-shift')).toHaveLength(84);
    expect(ids('C1.double-octaves')).toHaveLength(26);
  });
});
