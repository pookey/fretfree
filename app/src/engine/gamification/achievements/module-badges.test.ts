import { describe, expect, it } from 'vitest';
import type { SkillStateRecord, SkillStatus } from '../../model';
import { SKILLS } from '../../skills';
import { DEFAULT_GAMIFICATION } from '../../../storage/gamification-model';
import type { AchievementContext } from '../types';
import { checkAchievements } from './check';
import { ACHIEVEMENTS } from './index';

/**
 * The module badges (M10-17): one per module mastered whole (chords, CAGED,
 * harmony, progressions), plus the first song-ready progressions.
 */

const topicSkills = (topic: string) => SKILLS.filter((s) => s.topic === topic).map((s) => s.id);

/** Each module badge and the topic it marks mastered. */
const MODULES = [
  { id: 'chords-built', topic: 'C5' },
  { id: 'caged-shapes', topic: 'C6' },
  { id: 'harmony-every-key', topic: 'C8' },
  { id: 'progressions-all', topic: 'C9' },
] as const;

const MODULE_IDS = [...MODULES.map((m) => m.id), 'progressions-song-ready'];

function ctx(entries: Record<string, SkillStatus>): AchievementContext {
  const skillStates = new Map<string, SkillStateRecord>(
    Object.entries(entries).map(([skillId, status]) => [
      skillId,
      { skillId, status, guideLevel: 0, rollingAccuracy: 0.95 },
    ]),
  );
  return { skillStates, gamification: DEFAULT_GAMIFICATION, recentReviews: [] };
}

const all = (ids: readonly string[], status: SkillStatus) =>
  Object.fromEntries(ids.map((id) => [id, status]));

/** The module badges `c` newly earns, in display order. */
const earned = (c: AchievementContext) =>
  checkAchievements(c, new Set(), ACHIEVEMENTS)
    .map((d) => d.id)
    .filter((id) => MODULE_IDS.includes(id));

describe('module badges', () => {
  it('are registered, in curriculum order, with competence-framed copy', () => {
    const defs = ACHIEVEMENTS.filter((a) => MODULE_IDS.includes(a.id));
    expect(defs.map((d) => d.id)).toEqual([
      'chords-built',
      'caged-shapes',
      'harmony-every-key',
      'progressions-song-ready',
      'progressions-all',
    ]);
    for (const d of defs) {
      expect(d.category).toBe('mastery');
      expect(d.description).toMatch(/^You /);
    }
  });

  it('each cover a topic with skills, so none is earned on a fresh install', () => {
    for (const m of MODULES) expect(topicSkills(m.topic).length, m.topic).toBeGreaterThan(1);
    expect(SKILLS.some((s) => s.id === 'C9.pop')).toBe(true);
    expect(earned(ctx({}))).toEqual([]);
  });

  it('unlock once every skill in the module is mastered', () => {
    for (const m of MODULES) {
      const got = earned(ctx(all(topicSkills(m.topic), 'mastered')));
      expect(got, m.id).toContain(m.id);
    }
  });

  it('need the whole module: one skill short earns nothing', () => {
    for (const m of MODULES) {
      const ids = topicSkills(m.topic);
      for (const missing of ids) {
        const c = ctx({ ...all(ids, 'mastered'), [missing]: 'practising' });
        expect(earned(c), `${m.id} without ${missing}`).not.toContain(m.id);
      }
    }
  });

  it('mark mastery, never activity: practising every skill earns nothing', () => {
    const everything = MODULES.flatMap((m) => topicSkills(m.topic));
    for (const status of ['locked', 'unlocked', 'practising'] as const) {
      expect(earned(ctx(all(everything, status)))).toEqual([]);
    }
  });

  it('give "Song-ready" for the pop and rock progressions alone', () => {
    expect(earned(ctx({ 'C9.pop': 'mastered' }))).toEqual(['progressions-song-ready']);
    expect(earned(ctx({ 'C9.pop': 'practising' }))).toEqual([]);
    // The whole progressions module includes it.
    expect(earned(ctx(all(topicSkills('C9'), 'mastered')))).toEqual([
      'progressions-song-ready',
      'progressions-all',
    ]);
  });

  it('keep each module to its own badge', () => {
    expect(earned(ctx(all(topicSkills('C5'), 'mastered')))).toEqual(['chords-built']);
    expect(earned(ctx(all(topicSkills('C6'), 'mastered')))).toEqual(['caged-shapes']);
    expect(earned(ctx(all(topicSkills('C8'), 'mastered')))).toEqual(['harmony-every-key']);
  });
});
