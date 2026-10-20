import { describe, expect, it } from 'vitest';
import { moduleOfTopic } from '../frontier';
import { skills } from './f4';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('F4 skills', () => {
  it('runs pulse → eighths → syncopation, with strumming after the eighths', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'F4.pulse',
      'F4.eighths',
      'F4.syncopation',
      'F4.strumming',
    ]);
    expect(getSkill('F4.pulse')!.prerequisites).toEqual([]);
    expect(getSkill('F4.eighths')!.prerequisites).toEqual(['F4.pulse']);
    expect(getSkill('F4.syncopation')!.prerequisites).toEqual(['F4.eighths']);
    expect(getSkill('F4.strumming')!.prerequisites).toEqual(['F4.eighths']);
  });

  it('sits on the rhythm track after F3, drilled by D20 and left out of placement', () => {
    expect(moduleOfTopic('F4')?.id).toBe('rhythm');
    for (const s of skills) {
      expect(s.topic).toBe('F4');
      expect(s.drillTypes).toEqual(['tap-strum-rhythm']);
      expect(s.skipPlacement).toBe(true);
      expect(s.order).toBeGreaterThan(getSkill('F3.repeat-12')!.order);
      expect(s.order).toBeLessThan(getSkill('C1.octaves')!.order);
    }
    // Only the first opens on its own; the rest soft-unlock as it is practised.
    expect(skills.map((s) => s.softUnlock)).toEqual([false, true, true, true]);
  });

  it('has one card per rhythm', () => {
    expect(ids('F4.pulse')).toEqual([
      'tap-rhythm:quarters',
      'tap-rhythm:half-notes',
      'tap-rhythm:backbeat',
    ]);
    expect(ids('F4.eighths')).toEqual([
      'tap-rhythm:eighths',
      'tap-rhythm:offbeats',
      'tap-rhythm:quarter-eighths',
    ]);
    expect(ids('F4.syncopation')).toEqual([
      'tap-rhythm:charleston',
      'tap-rhythm:tresillo',
      'tap-rhythm:push-4',
    ]);
    expect(ids('F4.strumming')).toEqual([
      'strum-rhythm:down-quarters',
      'strum-rhythm:down-up-eighths',
      'strum-rhythm:d-du-udu',
    ]);
  });
});
