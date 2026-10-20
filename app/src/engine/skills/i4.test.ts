import { describe, expect, it } from 'vitest';
import { keyLabel, minorKey, parseKey } from '../../theory';
import { parseMinorHarmonyItemId } from '../items/minor-harmony';
import { parseNumeralItemId } from '../model';
import { I4_DEGREE_ORDER, I4_KEYS, skills } from './i4';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('I4 skills', () => {
  it('runs minor-key numerals → the harmonic-minor V → the minor ii–V–i', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'I4.minor-numerals',
      'I4.harmonic-minor',
      'I4.minor-ii-V-i',
    ]);
    expect(skills.map((s) => s.drillTypes)).toEqual([['numerals'], ['function'], ['function']]);
    for (const s of skills) expect(s.topic).toBe('I4');
    // After Progressions (design §5: Minor and function unlocks after it).
    expect(skills[0]!.order).toBeGreaterThan(getSkill('C10.capo-minor')!.order);
  });

  it('opens after the minor-key progression, and the ii–V–i after the major one', () => {
    expect(getSkill('I4.minor-numerals')!.prerequisites).toEqual(['C9.minor']);
    expect(getSkill('I4.harmonic-minor')!.prerequisites).toEqual(['I4.minor-numerals']);
    expect(getSkill('I4.minor-ii-V-i')!.prerequisites).toEqual(['I4.harmonic-minor', 'C9.ii-V-I']);
  });

  it('uses minor keys whose raised 7th needs no double sharp', () => {
    expect(I4_KEYS).toEqual(['Am', 'Em', 'Bm', 'F#m', 'C#m', 'Dm', 'Gm', 'Cm', 'Fm']);
    for (const k of I4_KEYS) expect(keyLabel(minorKey(k.slice(0, -1)))).toBe(k);
  });

  it('cards each natural-minor chord both ways on D11, songs’ chords first', () => {
    const am = ids('I4.minor-numerals').slice(0, 12);
    expect(am).toEqual([
      'numeral:iv@key=Am',
      'numeral-of:iv@key=Am',
      'numeral:bVII@key=Am',
      'numeral-of:bVII@key=Am',
      'numeral:bVI@key=Am',
      'numeral-of:bVI@key=Am',
      'numeral:bIII@key=Am',
      'numeral-of:bIII@key=Am',
      'numeral:v@key=Am',
      'numeral-of:v@key=Am',
      'numeral:ii°@key=Am',
      'numeral-of:ii°@key=Am',
    ]);
    expect(ids('I4.minor-numerals')).toHaveLength(I4_KEYS.length * I4_DEGREE_ORDER.length * 2);
    for (const id of ids('I4.minor-numerals')) {
      expect(parseKey(parseNumeralItemId(id)!.key).mode, id).toBe('minor');
    }
  });

  it('sets the harmonic V beside the natural v', () => {
    const am = ids('I4.harmonic-minor').filter((id) => id.endsWith('@key=Am'));
    expect(am.slice(0, 3)).toEqual([
      'minor-chord:V@key=Am',
      'minor-source:V@key=Am',
      'minor-source:v@key=Am',
    ]);
    for (const id of ids('I4.harmonic-minor')) {
      const ref = parseMinorHarmonyItemId(id);
      expect(ref, id).not.toBeNull();
      expect(ref!.kind === 'minor-chord' || ref!.kind === 'minor-source').toBe(true);
    }
    // Each key sets natural, harmonic and borrowed chords against each other
    // (the drill's tests check each source against theory/function).
    expect(am.filter((id) => id.startsWith('minor-source:'))).toHaveLength(11);
  });

  it('cards the ii–V–i once per key', () => {
    expect(ids('I4.minor-ii-V-i')).toEqual(I4_KEYS.map((k) => `two-five:${k}`));
  });

  it('holds each card in one skill only', () => {
    const all = skills.flatMap((s) => s.items().map((i) => i.id));
    expect(new Set(all).size).toBe(all.length);
  });
});
