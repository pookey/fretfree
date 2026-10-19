import { describe, expect, it } from 'vitest';
import { MAJOR_KEY_TONICS, isPracticalMajorKey, keySignature, majorKey } from '../../theory';
import { parseDegreeItemId, parseSpellKeyItemId } from '../model';
import {
  C4_FLAT_DEGREE_KEYS,
  C4_FLAT_KEYS,
  C4_SHARP_DEGREE_KEYS,
  C4_SHARP_KEYS,
  skills,
} from './c4';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('C4 skills', () => {
  it('runs sharp keys → flat keys, then degrees in each', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'C4.sharp-keys',
      'C4.flat-keys',
      'C4.sharp-key-degrees',
      'C4.flat-key-degrees',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('C4');
      expect(s.drillTypes).toEqual(['spell-it', 'play-sequence']);
      expect(s.softUnlock).toBe(true);
    }
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('opens after half and whole steps (F1), keys before their degrees', () => {
    expect(getSkill('C4.sharp-keys')!.prerequisites).toEqual(['F1.half-steps', 'F1.whole-steps']);
    expect(getSkill('C4.flat-keys')!.prerequisites).toEqual(['C4.sharp-keys']);
    expect(getSkill('C4.sharp-key-degrees')!.prerequisites).toEqual(['C4.sharp-keys']);
    expect(getSkill('C4.flat-key-degrees')!.prerequisites).toEqual([
      'C4.flat-keys',
      'C4.sharp-key-degrees',
    ]);
  });

  it('spells all 15 keys with a real signature, fewest accidentals first', () => {
    const tonics = [...ids('C4.sharp-keys'), ...ids('C4.flat-keys')].map(
      (id) => parseSpellKeyItemId(id)!.tonic,
    );
    expect(new Set(tonics)).toEqual(new Set(MAJOR_KEY_TONICS));
    for (const keys of [C4_SHARP_KEYS, C4_FLAT_KEYS]) {
      const counts = keys.map((k) => Math.abs(keySignature(majorKey(k)).alteration));
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
    }
    expect(ids('C4.sharp-keys')[0]).toBe('spell-key:C');
    expect(ids('C4.flat-keys')).toContain('spell-key:Cb');
  });

  it('asks every degree 2–7 both ways, one spelling per pitch class', () => {
    for (const [skillId, keys] of [
      ['C4.sharp-key-degrees', C4_SHARP_DEGREE_KEYS],
      ['C4.flat-key-degrees', C4_FLAT_DEGREE_KEYS],
    ] as const) {
      const refs = ids(skillId).map((id) => parseDegreeItemId(id)!);
      expect(refs).toHaveLength(keys.length * 6 * 2);
      for (const k of keys) {
        expect(isPracticalMajorKey(k)).toBe(true);
        for (const kind of ['degree', 'degree-of'] as const) {
          const degrees = refs.filter((r) => r.tonic === k && r.kind === kind).map((r) => r.degree);
          expect(degrees).toEqual([2, 3, 4, 5, 6, 7]);
        }
      }
    }
    const tonics = [...C4_SHARP_DEGREE_KEYS, ...C4_FLAT_DEGREE_KEYS];
    expect(tonics).toHaveLength(12);
    expect(ids('C4.flat-key-degrees')).toContain('degree:6@Eb');
    expect(ids('C4.sharp-key-degrees')).toContain('degree-of:7@F#');
  });
});
