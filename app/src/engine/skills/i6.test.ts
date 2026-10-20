import { describe, expect, it } from 'vitest';
import { SHAPE_INTERVALS } from '../../theory';
import { getSkill, SKILLS } from './index';
import source from './i6.ts?raw';
import { I6_CHORD_GROUPS, I6_INTERVAL_GROUPS, I6_PROGRESSION_GROUPS } from '../items/ear';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const I6 = SKILLS.filter((s) => s.topic === 'I6');

describe('I6 skills', () => {
  it('teaches rising intervals set by set, then falling and together', () => {
    expect(I6.filter((s) => s.id.startsWith('I6.intervals')).map((s) => s.id)).toEqual([
      'I6.intervals-fourths-fifths',
      'I6.intervals-thirds',
      'I6.intervals-seconds-sixths',
      'I6.intervals-sevenths',
      'I6.intervals-falling',
      'I6.intervals-together',
    ]);
    expect(ids('I6.intervals-fourths-fifths')).toEqual([
      'ear-interval:P4:up',
      'ear-interval:P5:up',
      'ear-interval:P8:up',
    ]);
    expect(ids('I6.intervals-falling')).toHaveLength(12);
    expect(ids('I6.intervals-together').every((id) => id.endsWith(':together'))).toBe(true);
  });

  it('covers every interval from m2 to P8 once in each direction', () => {
    const groups = I6_INTERVAL_GROUPS.flatMap((g) => g.members);
    expect([...groups].sort()).toEqual([...SHAPE_INTERVALS].sort());
    const all = I6.flatMap((s) => s.items().map((i) => i.id)).filter((id) =>
      id.startsWith('ear-interval:'),
    );
    expect(all).toHaveLength(36);
    expect(new Set(all).size).toBe(36);
  });

  it('opens on day one, once the first neck skill is being practised', () => {
    expect(getSkill('I6.intervals-fourths-fifths')!.prerequisites).toEqual(['F1.alphabet']);
    expect(getSkill('I6.chords-major-minor')!.prerequisites).toEqual(['F1.alphabet']);
    expect(ids('I6.chords-major-minor')).toEqual(['ear-chord:major', 'ear-chord:minor']);
    expect(getSkill('I6.chords-sevenths')!.prerequisites).toEqual([
      'I6.chords-diminished-augmented',
    ]);
  });

  it('opens progression ear with the C9 skill that names them (design §5)', () => {
    expect(getSkill('I6.progressions-pop')!.prerequisites).toEqual(['C9.pop']);
    expect(ids('I6.progressions-pop')).toEqual([
      'prog:I-IV-V:ear',
      'prog:I-V-vi-IV:ear',
      'prog:vi-IV-I-V:ear',
      'prog:I-vi-IV-V:ear',
    ]);
    expect(getSkill('I6.progressions-blues')!.prerequisites).toContain('C9.blues');
    // Every catalogue progression, once.
    const all = I6_PROGRESSION_GROUPS.flatMap((g) => g.members);
    expect(new Set(all).size).toBe(8);
  });

  it('is a soft-unlocking parallel track, drilled by D14', () => {
    for (const s of I6) {
      expect(s.softUnlock, s.id).toBe(true);
      expect(s.drillTypes).toEqual(['ear-identify']);
      expect(s.skipPlacement).toBeUndefined();
    }
    expect(I6_CHORD_GROUPS.flatMap((g) => g.members)).toHaveLength(8);
  });

  it('writes each skill ID out, for the e2e seed helpers that read this file', () => {
    // e2e/helpers/skills.ts reads `id: '<skill>'` literals: a built ID would
    // leak its cards into every seeded one-skill session.
    const literal = [...source.matchAll(/\bid: '([A-Z]\d+\.[\w-]+)'/g)].map((m) => m[1]);
    expect(literal.sort()).toEqual(I6.map((s) => s.id).sort());
  });
});
