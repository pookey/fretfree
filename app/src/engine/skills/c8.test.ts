import { describe, expect, it } from 'vitest';
import { chordFromNumeral, majorKey, nashvilleToRoman } from '../../theory';
import { parseNumeralItemId } from '../model';
import { C8_DEGREE_ORDER, skills } from './c8';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'];

describe('C8 skills', () => {
  it('runs Roman numerals, then Nashville numbers, on D11', () => {
    expect(skills.map((s) => s.id)).toEqual(['C8.numerals-major', 'C8.nashville']);
    for (const s of skills) {
      expect(s.topic).toBe('C8');
      expect(s.drillTypes).toEqual(['numerals']);
    }
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('gates numerals on keys and triads, and opens Nashville softly after them', () => {
    const roman = getSkill('C8.numerals-major')!;
    expect(roman.prerequisites).toEqual(['C4.flat-key-degrees', 'C5.triads']);
    expect(roman.softUnlock).toBeUndefined();
    const nashville = getSkill('C8.nashville')!;
    expect(nashville.prerequisites).toEqual(['C8.numerals-major']);
    expect(nashville.softUnlock).toBe(true);
    // Harmony starts early: before CAGED (research/03 recommended order).
    expect(roman.order).toBeLessThan(getSkill('C6.triad-cores')!.order);
  });

  it('asks every chord but I of 12 keys, both ways', () => {
    const all = ids('C8.numerals-major');
    expect(all).toHaveLength(12 * 6 * 2);
    expect(all.slice(0, 4)).toEqual([
      'numeral:IV@key=C',
      'numeral-of:IV@key=C',
      'numeral:V@key=C',
      'numeral-of:V@key=C',
    ]);
    expect(all).toContain('numeral:vi@key=D');
    expect(all).toContain('numeral-of:vii°@key=Db');
    expect(all.some((id) => id.startsWith('numeral:I@'))).toBe(false);
    const keys = [...new Set(all.map((id) => parseNumeralItemId(id)!.key))];
    expect(keys).toEqual(KEYS);
  });

  it('brings IV and V first, then vi, ii, iii and vii°', () => {
    expect(C8_DEGREE_ORDER).toEqual([4, 5, 6, 2, 3, 7]);
    const inC = ids('C8.numerals-major')
      .filter((id) => id.startsWith('numeral:') && id.endsWith('@key=C'))
      .map((id) => parseNumeralItemId(id)!.numeral);
    expect(inC).toEqual(['IV', 'V', 'vi', 'ii', 'iii', 'vii°']);
  });

  it('reads Nashville numbers as chords in the same keys', () => {
    const all = ids('C8.nashville');
    expect(all).toHaveLength(12 * 6);
    expect(all.slice(0, 6)).toEqual([
      'nashville:4@key=C',
      'nashville:5@key=C',
      'nashville:6m@key=C',
      'nashville:2m@key=C',
      'nashville:3m@key=C',
      'nashville:7°@key=C',
    ]);
    // Each Nashville card is the same fact as a Roman one, in another notation.
    for (const id of all) {
      const ref = parseNumeralItemId(id)!;
      const roman = nashvilleToRoman(ref.numeral);
      expect(ids('C8.numerals-major')).toContain(`numeral:${roman}@key=${ref.key}`);
      expect(chordFromNumeral(majorKey(ref.key), roman).nashville).toBe(ref.numeral);
    }
  });
});
