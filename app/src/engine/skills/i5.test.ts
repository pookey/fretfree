import { describe, expect, it } from 'vitest';
import { parseFunctionItemId } from '../items/function';
import { skills } from './i5';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('I5 skills', () => {
  it('runs function → secondary dominants → borrowed chords → substitutes', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'I5.function-major',
      'I5.function-minor',
      'I5.secondary-dominants',
      'I5.borrowed',
      'I5.substitutes',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('I5');
      expect(s.drillTypes).toEqual(['function']);
    }
    // After I4, its neighbour in the Minor and function module.
    expect(skills[0]!.order).toBeGreaterThan(getSkill('I4.minor-ii-V-i')!.order);
  });

  it('gates on progressions, the harmonic V, 7th chords and minor-key chords', () => {
    expect(getSkill('I5.function-major')!.prerequisites).toEqual(['C9.pop']);
    expect(getSkill('I5.function-minor')!.prerequisites).toEqual([
      'I5.function-major',
      'I4.harmonic-minor',
    ]);
    expect(getSkill('I5.secondary-dominants')!.prerequisites).toEqual([
      'I5.function-major',
      'C5.sevenths',
    ]);
    expect(getSkill('I5.borrowed')!.prerequisites).toEqual([
      'I5.function-major',
      'I4.minor-numerals',
    ]);
    expect(getSkill('I5.substitutes')!.prerequisites).toEqual(['I5.secondary-dominants']);
  });

  it('cards each degree’s function once per mode, commonest first', () => {
    expect(ids('I5.function-major')).toEqual([
      'function:IV@major',
      'function:V@major',
      'function:vi@major',
      'function:ii@major',
      'function:iii@major',
      'function:vii°@major',
    ]);
    expect(ids('I5.function-minor')[1]).toBe('function:V@minor');
    expect(ids('I5.function-minor')).toHaveLength(8);
  });

  it('cards each secondary dominant both ways, V/V and V/ii first', () => {
    expect(ids('I5.secondary-dominants').slice(0, 4)).toEqual([
      'secondary:V7/V@key=C',
      'secondary-of:V7/V@key=C',
      'secondary:V7/ii@key=C',
      'secondary-of:V7/ii@key=C',
    ]);
    expect(ids('I5.secondary-dominants')).toHaveLength(6 * 5 * 2);
  });

  it('spots iv and ♭VII first, and has a tritone card for every root', () => {
    expect(ids('I5.borrowed').slice(0, 2)).toEqual(['borrowed:iv@key=C', 'borrowed:bVII@key=C']);
    expect(ids('I5.borrowed')).toHaveLength(30);
    const roots = ids('I5.substitutes').map((id) => {
      const ref = parseFunctionItemId(id);
      return ref?.kind === 'tritone-sub' ? ref.chord : null;
    });
    expect(roots).toHaveLength(12);
    expect(roots[0]).toBe('G7');
  });

  it('holds each card in one skill only', () => {
    const all = skills.flatMap((s) => s.items().map((i) => i.id));
    expect(new Set(all).size).toBe(all.length);
  });
});
