import { describe, expect, it } from 'vitest';
import { moduleOfTopic } from '../frontier';
import { parseTabItemId } from '../items/tab';
import { deriveStatus } from '../mastery';
import type { SkillStatus } from '../model';
import { getSkill, SKILLS } from './index';
import { TAB_FRET_ORDER, TAB_STRING_ORDER, skills } from './tab';

const tabSkills = SKILLS.filter((s) => s.topic === 'TAB');

describe('TAB skills', () => {
  it('registers one skill per string, outer lines first', () => {
    expect(tabSkills.map((s) => s.id)).toEqual([
      'TAB.string1',
      'TAB.string6',
      'TAB.string2',
      'TAB.string5',
      'TAB.string3',
      'TAB.string4',
    ]);
    expect(tabSkills).toEqual(skills);
    expect(moduleOfTopic('TAB')).toBeDefined();
  });

  it('holds every cell of its string at frets 0–12, once', () => {
    const all = tabSkills.flatMap((s) => s.items());
    expect(all).toHaveLength(6 * 13);
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    for (const [i, string] of TAB_STRING_ORDER.entries()) {
      const skill = tabSkills[i]!;
      const cells = skill.items().map((item) => parseTabItemId(item.id));
      expect(cells.every((c) => c?.string === string)).toBe(true);
      expect(cells.map((c) => c!.fret).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 13 }, (_, f) => f),
      );
      for (const item of skill.items()) expect(item.skillId).toBe(skill.id);
    }
  });

  it('introduces the open string and the landmarks before the frets between them', () => {
    expect(TAB_FRET_ORDER.slice(0, 6)).toEqual([0, 3, 5, 7, 9, 12]);
    expect(
      getSkill('TAB.string1')!
        .items()
        .slice(0, 4)
        .map((i) => i.id),
    ).toEqual(['tab@s1f0', 'tab@s1f3', 'tab@s1f5', 'tab@s1f7']);
  });

  it('opens one string at a time, each once the last is practising', () => {
    const statuses = new Map<string, SkillStatus>([['F3.markers', 'practising']]);
    const status = (id: string) => deriveStatus(getSkill(id)!, statuses, undefined);
    expect(status('TAB.string1')).toBe('unlocked');
    expect(status('TAB.string6')).toBe('locked');
    statuses.set('TAB.string1', 'practising');
    expect(status('TAB.string6')).toBe('unlocked');
    expect(status('TAB.string2')).toBe('locked');
    for (const s of tabSkills) {
      expect(s.softUnlock).toBe(true);
      expect(s.prerequisites).toHaveLength(1);
    }
    expect(getSkill('TAB.string1')!.prerequisites).toEqual(['F3.markers']);
  });

  it('is served by D33, and stays out of the placement test', () => {
    for (const s of tabSkills) {
      expect(s.drillTypes).toEqual(['tab-to-neck']);
      expect(s.skipPlacement).toBe(true);
    }
  });
});
