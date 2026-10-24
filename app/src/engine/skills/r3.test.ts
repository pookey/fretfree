import { describe, expect, it } from 'vitest';
import { applyKeySignature, keySignature, majorKey } from '../../theory';
import { moduleOfTopic } from '../frontier';
import { parseKeyApplyItemId } from '../items/key-apply';
import { getSkill } from './index';
import { R3_DRILLS, r3Letters, skills } from './r3';

const ids = (id: string) =>
  getSkill(id)!
    .items()
    .map((i) => i.id);

/** I3's fifteen major keys, by signature. */
const KEY_OF: Record<number, string> = {
  0: 'C',
  1: 'G',
  2: 'D',
  3: 'A',
  4: 'E',
  5: 'B',
  6: 'F#',
  7: 'C#',
  [-1]: 'F',
  [-2]: 'Bb',
  [-3]: 'Eb',
  [-4]: 'Ab',
  [-5]: 'Db',
  [-6]: 'Gb',
  [-7]: 'Cb',
};

describe('R3 key-signature skills', () => {
  it('asks the altered letters and the next, natural one', () => {
    expect(r3Letters(0)).toEqual(['F']);
    expect(r3Letters(2)).toEqual(['F', 'C', 'G']);
    expect(r3Letters(-1)).toEqual(['B', 'E']);
    expect(r3Letters(7)).toEqual([...'FCGDAEB']);
    expect(r3Letters(-7)).toEqual([...'BEADGCF']);
    for (let a = -7; a <= 7; a++) {
      const key = majorKey(KEY_OF[a]!);
      const letters = r3Letters(a);
      const altered = letters.filter((l) => applyKeySignature(l, key) !== l);
      expect(altered).toHaveLength(Math.abs(a));
      expect(keySignature(key).accidentals.map((n) => n.charAt(0))).toEqual(altered);
    }
  });

  it('brings in the sharps, then the flats, a few at a time', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'R3.sharps-few',
      'R3.flats-few',
      'R3.sharps-many',
      'R3.flats-many',
    ]);
    expect(ids('R3.sharps-few')).toEqual([
      'key-apply:F@0',
      'key-apply:F@1#',
      'key-apply:C@1#',
      'key-apply:F@2#',
      'key-apply:C@2#',
      'key-apply:G@2#',
      'key-apply:F@3#',
      'key-apply:C@3#',
      'key-apply:G@3#',
      'key-apply:D@3#',
    ]);
    expect(ids('R3.flats-few')[0]).toBe('key-apply:B@0');
    expect(ids('R3.flats-few')).toHaveLength(10);
    expect(ids('R3.sharps-many')).toHaveLength(25);
    expect(ids('R3.flats-many')).toHaveLength(25);
    const all = skills.flatMap((s) => ids(s.id));
    expect(new Set(all).size).toBe(all.length);
    for (const s of skills) {
      expect(s.items().every((i) => parseKeyApplyItemId(i.id) !== null)).toBe(true);
      expect(s.items().every((i) => i.skillId === s.id)).toBe(true);
    }
  });

  it('opens with R1’s staff and I3’s signatures, in the reading module', () => {
    expect(getSkill('R3.sharps-few')!.prerequisites).toEqual(['R1.staff', 'I3.sharp-signatures']);
    expect(getSkill('R3.flats-few')!.prerequisites).toEqual([
      'R3.sharps-few',
      'I3.flat-signatures',
    ]);
    for (const s of skills) {
      expect(s).toMatchObject({ topic: 'R3', softUnlock: true });
      expect(s.drillTypes).toEqual(R3_DRILLS);
    }
    expect(moduleOfTopic('R3')?.id).toBe('reading');
  });
});
