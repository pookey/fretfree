import { describe, expect, it } from 'vitest';
import {
  itemId,
  parseItemId,
  parseProgressionItemId,
  progressionItemId,
  type ProgressionTask,
} from '../model';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('C9 skills', () => {
  it('builds every progression, then transposes it', () => {
    expect(ids('C9.pop')).toEqual([
      'prog:I-IV-V:build',
      'prog:I-V-vi-IV:build',
      'prog:vi-IV-I-V:build',
      'prog:I-vi-IV-V:build',
      'prog:I-IV-V:transpose',
      'prog:I-V-vi-IV:transpose',
      'prog:vi-IV-I-V:transpose',
      'prog:I-vi-IV-V:transpose',
    ]);
    expect(ids('C9.ii-V-I')).toEqual(['prog:ii-V-I:build', 'prog:ii-V-I:transpose']);
    expect(ids('C9.blues')).toHaveLength(4);
    expect(ids('C9.minor')).toEqual([
      'prog:i-bVII-bVI-bVII:build',
      'prog:i-bVII-bVI-bVII:transpose',
    ]);
  });

  it('introduces the rotation pair back to back in one skill', () => {
    const pop = ids('C9.pop');
    expect(pop.indexOf('prog:vi-IV-I-V:build') - pop.indexOf('prog:I-V-vi-IV:build')).toBe(1);
  });

  it('opens on chord construction (rule 7), the rest once pop is under way', () => {
    expect(getSkill('C9.pop')).toMatchObject({
      topic: 'C9',
      prerequisites: ['C4.flat-key-degrees', 'C5.triads'],
      drillTypes: ['progression-builder'],
    });
    expect(getSkill('C9.pop')?.softUnlock).toBeUndefined();
    expect(getSkill('C9.blues')).toMatchObject({
      prerequisites: ['C9.pop', 'C5.sevenths'],
      softUnlock: true,
    });
  });
});

describe('progression item IDs', () => {
  it('round-trip through the item registry', () => {
    const id = progressionItemId('I-V-vi-IV', 'build');
    expect(id).toBe('prog:I-V-vi-IV:build');
    expect(parseItemId(id)).toEqual({
      kind: 'progression',
      progression: 'I-V-vi-IV',
      task: 'build',
    });
    expect(itemId({ kind: 'progression', progression: '12-bar-blues', task: 'transpose' })).toBe(
      'prog:12-bar-blues:transpose',
    );
  });

  it('accepts only catalogue progressions and known tasks', () => {
    expect(parseProgressionItemId('prog:I-II-III:build')).toBeNull();
    expect(parseProgressionItemId('prog:I-IV-V:ear')).toBeNull();
    expect(parseProgressionItemId('prog:I-IV-V')).toBeNull();
    expect(() => progressionItemId('nope', 'build')).toThrow(/Unknown progression/);
    expect(() => progressionItemId('I-IV-V', 'ear' as ProgressionTask)).toThrow(/Invalid/);
  });
});
