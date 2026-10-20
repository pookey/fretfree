import { describe, expect, it } from 'vitest';
import { deriveStatus } from '../mastery';
import { parseChordToneItemId, type SkillStatus } from '../model';
import { skills } from './c5-chord-tones';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const degrees = (skillId: string) => [
  ...new Set(ids(skillId).map((id) => parseChordToneItemId(id)!.degree)),
];

const STAGES = ['C5.tones-roots', 'C5.tones-thirds', 'C5.tones-fifths', 'C5.tones-sevenths'];

describe('C5 chord-tone stages', () => {
  it('runs root → 3rd → 5th → 7th, after spelling chords', () => {
    expect(skills.map((s) => s.id)).toEqual(STAGES);
    expect(skills.map((s) => degrees(s.id))).toEqual([
      ['1'],
      ['3', 'b3'],
      ['5'],
      ['3', 'b7', '7', 'b3'],
    ]);
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(orders[0]).toBeGreaterThan(getSkill('C5.sus-add')!.order);
    expect(orders.at(-1)).toBeLessThan(getSkill('C6.triad-cores')!.order);
    for (const s of skills) {
      expect(s.topic).toBe('C5');
      expect(s.drillTypes).toEqual(['chord-tone']);
    }
  });

  it('gates each stage on the one before, the root on notes and triads (rule 7)', () => {
    expect(getSkill('C5.tones-roots')!.prerequisites).toEqual([
      'F2.string6-naturals',
      'F2.string5-naturals',
      'C5.triads',
    ]);
    expect(getSkill('C5.tones-thirds')!.prerequisites).toEqual(['C5.tones-roots']);
    expect(getSkill('C5.tones-fifths')!.prerequisites).toEqual(['C5.tones-thirds']);
    expect(getSkill('C5.tones-sevenths')!.prerequisites).toEqual([
      'C5.tones-fifths',
      'C5.sevenths',
    ]);
    for (const s of skills) expect(s.softUnlock).toBeFalsy();
  });

  it('opens the next stage only once the one before is mastered', () => {
    const status = (stage: string, before: SkillStatus) =>
      deriveStatus(
        getSkill(stage)!,
        new Map([[STAGES[STAGES.indexOf(stage) - 1]!, before]]),
        undefined,
      );
    for (const stage of ['C5.tones-thirds', 'C5.tones-fifths']) {
      expect(status(stage, 'unlocked')).toBe('locked');
      expect(status(stage, 'practising')).toBe('locked');
      expect(status(stage, 'mastered')).toBe('unlocked');
    }
    const sevenths = getSkill('C5.tones-sevenths')!;
    const statuses = new Map<string, SkillStatus>([
      ['C5.tones-fifths', 'mastered'],
      ['C5.sevenths', 'practising'],
    ]);
    expect(deriveStatus(sevenths, statuses, undefined)).toBe('locked');
    statuses.set('C5.sevenths', 'mastered');
    expect(deriveStatus(sevenths, statuses, undefined)).toBe('unlocked');
  });

  it('enters tap then name per tone, major next to minor', () => {
    expect(ids('C5.tones-roots')).toEqual([
      'chord-tone:1@major',
      'chord-tone-name:1@major',
      'chord-tone:1@minor',
      'chord-tone-name:1@minor',
    ]);
    expect(ids('C5.tones-thirds')).toEqual([
      'chord-tone:3@major',
      'chord-tone-name:3@major',
      'chord-tone:b3@minor',
      'chord-tone-name:b3@minor',
    ]);
    expect(ids('C5.tones-fifths')).toEqual([
      'chord-tone:5@major',
      'chord-tone-name:5@major',
      'chord-tone:5@minor',
      'chord-tone-name:5@minor',
    ]);
    expect(ids('C5.tones-sevenths').slice(0, 4)).toEqual([
      'chord-tone:3@7',
      'chord-tone-name:3@7',
      'chord-tone:b7@7',
      'chord-tone-name:b7@7',
    ]);
  });

  it('keeps every stage out of the placement test', () => {
    for (const id of STAGES) expect(getSkill(id)!.skipPlacement).toBe(true);
  });
});
