import { describe, expect, it } from 'vitest';
import { skills } from './i1-voice-leading';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('I1 voice-leading skills', () => {
  it('follows the inversions on the same sets, before C10', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'I1.voice-leading-top-sets',
      'I1.voice-leading-low-sets',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('I1');
      expect(s.drillTypes).toEqual(['voice-leading']);
      expect(s.order).toBeGreaterThan(getSkill('I1.minor-low-sets')!.order);
      expect(s.order).toBeLessThan(getSkill('C10.capo-g-c-d')!.order);
    }
  });

  it('gates each pair of sets on its inversions (rule 7)', () => {
    expect(getSkill('I1.voice-leading-top-sets')!.prerequisites).toEqual(['I1.major-top-sets']);
    expect(getSkill('I1.voice-leading-top-sets')!.softUnlock).toBe(false);
    expect(getSkill('I1.voice-leading-low-sets')!.prerequisites).toEqual([
      'I1.major-low-sets',
      'I1.voice-leading-top-sets',
    ]);
  });

  it('runs I–IV–V–I on a set, then the moves back, one set at a time', () => {
    expect(ids('I1.voice-leading-top-sets')).toEqual([
      'voice-lead:I-IV@s3',
      'voice-lead:IV-V@s3',
      'voice-lead:V-I@s3',
      'voice-lead:IV-I@s3',
      'voice-lead:V-IV@s3',
      'voice-lead:I-V@s3',
      'voice-lead:I-IV@s4',
      'voice-lead:IV-V@s4',
      'voice-lead:V-I@s4',
      'voice-lead:IV-I@s4',
      'voice-lead:V-IV@s4',
      'voice-lead:I-V@s4',
    ]);
    expect(ids('I1.voice-leading-low-sets')[0]).toBe('voice-lead:I-IV@s5');
    expect(ids('I1.voice-leading-low-sets').at(-1)).toBe('voice-lead:I-V@s6');
  });
});
