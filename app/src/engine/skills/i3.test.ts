import { describe, expect, it } from 'vitest';
import { keySignature, majorKey } from '../../theory';
import { parseKeyFactItemId, parseSignatureKeyItemId } from '../model';
import { C4_FLAT_KEYS, C4_SHARP_KEYS } from './c4';
import { I3_FLAT_KEYS, I3_SHARP_KEYS, skills } from './i3';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('I3 skills', () => {
  it('runs sharp signatures → flat signatures → the V and the relative minor', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'I3.sharp-signatures',
      'I3.flat-signatures',
      'I3.dominants',
      'I3.relative-minors',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('I3');
      expect(s.drillTypes).toEqual(['key-signature']);
      expect(s.softUnlock).toBe(true);
    }
    // Straight after C4's skills, its partner in the Keys module.
    expect(skills[0]!.order).toBeGreaterThan(getSkill('C4.flat-key-degrees')!.order);
    expect(skills.at(-1)!.order).toBeLessThan(getSkill('C5.triads')!.order);
  });

  it('opens once the keys can be spelled (C4)', () => {
    expect(getSkill('I3.sharp-signatures')!.prerequisites).toEqual(['C4.sharp-keys']);
    expect(getSkill('I3.flat-signatures')!.prerequisites).toEqual([
      'I3.sharp-signatures',
      'C4.flat-keys',
    ]);
    expect(getSkill('I3.dominants')!.prerequisites).toEqual(['I3.flat-signatures']);
    expect(getSkill('I3.relative-minors')!.prerequisites).toEqual(['I3.flat-signatures']);
  });

  it('asks about C4’s keys, sharp keys in one skill and flat keys in the other', () => {
    expect(I3_SHARP_KEYS).toEqual(C4_SHARP_KEYS);
    expect(I3_FLAT_KEYS).toEqual(C4_FLAT_KEYS);
    const signatureOf = (tonic: string) => keySignature(majorKey(tonic)).alteration;
    for (const [skill, sign] of [
      ['I3.sharp-signatures', 1],
      ['I3.flat-signatures', -1],
    ] as const) {
      for (const id of ids(skill)) {
        const fact = parseKeyFactItemId(id);
        const alteration = fact
          ? signatureOf(fact.tonic)
          : (parseSignatureKeyItemId(id)?.alteration as number);
        expect(Math.sign(alteration) === sign || alteration === 0, id).toBe(true);
      }
    }
  });

  it('has one card per key and direction for each signature', () => {
    expect(ids('I3.sharp-signatures')).toEqual([
      'key-signature:C',
      'key-signature:G',
      'key-signature:D',
      'key-signature:A',
      'key-signature:E',
      'key-signature:B',
      'key-signature:F#',
      'key-signature:C#',
      'signature-key:0',
      'signature-key:1#',
      'signature-key:2#',
      'signature-key:3#',
      'signature-key:4#',
      'signature-key:5#',
      'signature-key:6#',
      'signature-key:7#',
    ]);
    expect(ids('I3.flat-signatures')).toHaveLength(14);
    expect(ids('I3.flat-signatures')).toContain('signature-key:7b');
    expect(ids('I3.relative-minors')).toHaveLength(15);
  });

  it('gives every key but C♯ a V card: its V, G♯ major, needs a double sharp', () => {
    const vs = ids('I3.dominants');
    expect(vs).toHaveLength(14);
    expect(vs).not.toContain('dominant:C#');
    expect(vs).toContain('dominant:Cb');
  });
});
