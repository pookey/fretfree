import { describe, expect, it } from 'vitest';
import { DRILLS, getDrill } from '../drills/registry';
import { ENGINE_CONFIG } from '../engine/config';
import { moduleOfTopic } from '../engine/frontier';
import type { Skill } from '../engine/model';
import { getSkill, SKILLS } from '../engine/skills';
import { listOf, probedModules } from './retake';

describe('probedModules', () => {
  it('names the modules of the probed topics once each, in curriculum order', () => {
    const skills = ['F2.string6-naturals', 'F2.string5-naturals', 'C2.all-notes'].map(
      (id) => getSkill(id) as Skill,
    );
    expect(probedModules(skills, [getDrill('name-the-note')!])).toEqual([
      'Neck basics',
      'Whole neck',
    ]);
  });

  it('leaves out topics no drill can test', () => {
    expect(probedModules([getSkill('C3.thirds') as Skill], [getDrill('name-the-note')!])).toEqual(
      [],
    );
  });

  it('covers every configured topic that has skills and drills today', () => {
    const titles = probedModules(SKILLS, DRILLS);
    const withSkills = ENGINE_CONFIG.placement.topics.filter((t) =>
      SKILLS.some((s) => s.topic === t),
    );
    // The retake picks up topics that landed after onboarding, e.g. C5's chord spelling.
    expect(withSkills).toContain('C5');
    for (const t of withSkills) expect(titles).toContain(moduleOfTopic(t)!.title);
  });
});

describe('listOf', () => {
  it('joins words as an English list', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['a'])).toBe('a');
    expect(listOf(['a', 'b'])).toBe('a and b');
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
