import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import type { ReviewLogRecord, SkillStateRecord, SkillStatus } from '../../model';
import { SKILLS } from '../../skills';
import { DEFAULT_GAMIFICATION } from '../../../storage/gamification-model';
import type { AchievementContext, AchievementDefinition } from '../types';
import { checkAchievements } from './check';
import { masteryAchievement, streakAchievement } from './helpers';
import { ACHIEVEMENTS } from './index';
import { isSpeedDemon } from './speed-demon';

const at = new Date('2026-10-18T09:00:00Z');

function ctx(over: Partial<AchievementContext> = {}): AchievementContext {
  return {
    skillStates: new Map(),
    gamification: DEFAULT_GAMIFICATION,
    recentReviews: [],
    ...over,
  };
}

function states(entries: Record<string, SkillStatus>): Map<string, SkillStateRecord> {
  return new Map(
    Object.entries(entries).map(([skillId, status]) => [
      skillId,
      { skillId, status, guideLevel: 0, rollingAccuracy: 0.95 },
    ]),
  );
}

function review(over: Partial<ReviewLogRecord> = {}): ReviewLogRecord {
  return {
    itemId: 'note@s6f5',
    skillId: 'F2.string6-naturals',
    drillType: 'name-the-note',
    correct: true,
    responseMs: 900,
    rating: Rating.Easy,
    hintUsed: false,
    answerGiven: 'A',
    at,
    ...over,
  };
}

const reviews = (n: number, over: Partial<ReviewLogRecord> = {}) =>
  Array.from({ length: n }, () => review(over));

const ids = (defs: readonly AchievementDefinition[]) => defs.map((d) => d.id);
const none = new Set<string>();

describe('achievement registry', () => {
  it('registers every first-milestone badge in display order', () => {
    expect(ids(ACHIEVEMENTS)).toEqual([
      'string-6-master',
      'string-5-master',
      'whole-neck',
      'mic-notes',
      'mic-sequences',
      'speed-demon',
      'streak-7',
      'streak-30',
      'streak-100',
      'streak-365',
    ]);
  });

  it('has unique ids, titles and competence-framed copy', () => {
    expect(new Set(ids(ACHIEVEMENTS)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(ACHIEVEMENTS.map((a) => a.title)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.description).toMatch(/^Your? /);
  });

  it('ties every mastery badge to a registered skill', () => {
    const skillIds = new Set(SKILLS.map((s) => s.id));
    for (const id of ['F2.string6-naturals', 'F2.string5-naturals', 'C2.all-notes']) {
      expect(skillIds.has(id)).toBe(true);
    }
  });

  it('unlocks nothing on a fresh install', () => {
    expect(checkAchievements(ctx(), none, ACHIEVEMENTS)).toEqual([]);
  });
});

describe('checkAchievements', () => {
  it('returns newly met badges in order and skips already-unlocked ones', () => {
    const c = ctx({
      skillStates: states({ 'C2.all-notes': 'mastered', 'F2.string6-naturals': 'mastered' }),
      gamification: { ...DEFAULT_GAMIFICATION, streakLongest: 30 },
    });
    expect(ids(checkAchievements(c, none, ACHIEVEMENTS))).toEqual([
      'string-6-master',
      'whole-neck',
      'streak-7',
      'streak-30',
    ]);
    expect(
      ids(checkAchievements(c, new Set(['string-6-master', 'streak-7']), ACHIEVEMENTS)),
    ).toEqual(['whole-neck', 'streak-30']);
  });

  it('sorts by order then id whatever order the definitions come in', () => {
    const always = (id: string, order: number): AchievementDefinition => ({
      id,
      title: id,
      description: id,
      category: 'streak',
      order,
      isUnlocked: () => true,
    });
    const defs = [always('c', 2), always('b', 1), always('a', 2)];
    expect(ids(checkAchievements(ctx(), none, defs))).toEqual(['b', 'a', 'c']);
  });

  it('never re-evaluates an unlocked badge, so earned badges stay earned', () => {
    let calls = 0;
    const def: AchievementDefinition = {
      id: 'x',
      title: 'x',
      description: 'x',
      category: 'mastery',
      order: 1,
      isUnlocked: () => {
        calls++;
        return true;
      },
    };
    expect(checkAchievements(ctx(), new Set(['x']), [def])).toEqual([]);
    expect(calls).toBe(0);
  });

  it('is pure: the same input gives the same output and nothing is mutated', () => {
    const c = ctx({ skillStates: states({ 'F2.string5-naturals': 'mastered' }) });
    const unlocked = new Set<string>();
    const defs = [...ACHIEVEMENTS];
    const first = checkAchievements(c, unlocked, defs);
    expect(checkAchievements(c, unlocked, defs)).toEqual(first);
    expect(unlocked.size).toBe(0);
    expect(ids(defs)).toEqual(ids(ACHIEVEMENTS));
  });
});

describe('mastery badges', () => {
  const masteryIds = ['string-6-master', 'string-5-master', 'whole-neck'];
  const unlockedFor = (c: AchievementContext) =>
    ids(checkAchievements(c, none, ACHIEVEMENTS)).filter((id) => masteryIds.includes(id));

  it('need the skill mastered, not merely practised', () => {
    for (const status of ['locked', 'unlocked', 'practising'] as const) {
      const c = ctx({
        skillStates: states({
          'F2.string6-naturals': status,
          'F2.string5-naturals': status,
          'C2.all-notes': status,
        }),
      });
      expect(unlockedFor(c)).toEqual([]);
    }
  });

  it('map each badge to its own skill', () => {
    expect(
      unlockedFor(ctx({ skillStates: states({ 'F2.string6-naturals': 'mastered' }) })),
    ).toEqual(['string-6-master']);
    expect(
      unlockedFor(ctx({ skillStates: states({ 'F2.string5-naturals': 'mastered' }) })),
    ).toEqual(['string-5-master']);
    expect(unlockedFor(ctx({ skillStates: states({ 'C2.all-notes': 'mastered' }) }))).toEqual([
      'whole-neck',
    ]);
  });

  it('ignore activity: thousands of answers without mastery earn nothing', () => {
    const c = ctx({
      skillStates: states({ 'F2.string6-naturals': 'practising' }),
      recentReviews: reviews(50, { responseMs: 3000 }),
      gamification: { ...DEFAULT_GAMIFICATION, xpTotal: 1_000_000 },
    });
    expect(checkAchievements(c, none, ACHIEVEMENTS)).toEqual([]);
  });

  it('builds a mastery badge from a skill id', () => {
    const def = masteryAchievement({
      id: 'm',
      title: 'M',
      description: 'You know it.',
      order: 1,
      skillId: 'S',
    });
    expect(def.category).toBe('mastery');
    expect(def.isUnlocked(ctx({ skillStates: states({ S: 'mastered' }) }))).toBe(true);
    expect(def.isUnlocked(ctx())).toBe(false);
  });
});

describe('streak badges', () => {
  const streakIds = (c: AchievementContext) =>
    ids(checkAchievements(c, none, ACHIEVEMENTS)).filter((id) => id.startsWith('streak-'));
  const longest = (streakLongest: number, streakCurrent = 0) =>
    ctx({ gamification: { ...DEFAULT_GAMIFICATION, streakLongest, streakCurrent } });

  it('unlock at exactly 7, 30, 100 and 365 days', () => {
    expect(streakIds(longest(6))).toEqual([]);
    expect(streakIds(longest(7))).toEqual(['streak-7']);
    expect(streakIds(longest(29))).toEqual(['streak-7']);
    expect(streakIds(longest(30))).toEqual(['streak-7', 'streak-30']);
    expect(streakIds(longest(100))).toEqual(['streak-7', 'streak-30', 'streak-100']);
    expect(streakIds(longest(364))).toEqual(['streak-7', 'streak-30', 'streak-100']);
    expect(streakIds(longest(365))).toEqual(['streak-7', 'streak-30', 'streak-100', 'streak-365']);
  });

  it('go by the longest streak, so a later break does not matter', () => {
    expect(streakIds(longest(8, 0))).toEqual(['streak-7']);
  });

  it('build their copy from the day count', () => {
    const def = streakAchievement(42, 5);
    expect(def).toMatchObject({ id: 'streak-42', title: '42-day streak', order: 5 });
    expect(def.description).toContain('42 days');
  });
});

describe('speed demon', () => {
  const cfg = { medianMs: 1200, minAnswers: 30, minAccuracy: 0.9 };
  const fast = (c: AchievementContext) =>
    ids(checkAchievements(c, none, ACHIEVEMENTS)).includes('speed-demon');

  it('unlocks when the median correct answer is under 1.2 s', () => {
    expect(fast(ctx({ recentReviews: reviews(30, { responseMs: 1199 }) }))).toBe(true);
    expect(fast(ctx({ recentReviews: reviews(30, { responseMs: 1200 }) }))).toBe(false);
  });

  it('uses the median, so a few slow answers do not block it', () => {
    const recentReviews = [
      ...reviews(20, { responseMs: 800 }),
      ...reviews(12, { responseMs: 5000 }),
    ];
    expect(isSpeedDemon(ctx({ recentReviews }), cfg)).toBe(true);
  });

  it('ignores guided reps, where the note was shown', () => {
    const recentReviews = [...reviews(29), ...reviews(40, { hintUsed: true, responseMs: 300 })];
    expect(isSpeedDemon(ctx({ recentReviews }), cfg)).toBe(false);
    expect(isSpeedDemon(ctx({ recentReviews: [...recentReviews, review()] }), cfg)).toBe(true);
  });

  it('needs enough answers to be a fluency signal', () => {
    expect(isSpeedDemon(ctx({ recentReviews: reviews(29) }), cfg)).toBe(false);
  });

  it('leaves out timing drills, whose responseMs is a timing error', () => {
    // 40 tight D20 reps log ~20 ms each, but nothing was answered quickly.
    const rhythm = reviews(40, { drillType: 'tap-strum-rhythm', responseMs: 20 });
    expect(isSpeedDemon(ctx({ recentReviews: rhythm }), cfg)).toBe(false);
    const slow = reviews(30, { responseMs: 3000 });
    expect(isSpeedDemon(ctx({ recentReviews: [...rhythm, ...slow] }), cfg)).toBe(false);
  });

  it('cannot be earned by fast guessing', () => {
    const recentReviews = [
      ...reviews(26, { responseMs: 400 }),
      ...reviews(4, { correct: false, rating: Rating.Again, responseMs: 400 }),
    ];
    expect(isSpeedDemon(ctx({ recentReviews }), cfg)).toBe(false);
    expect(isSpeedDemon(ctx({ recentReviews: [...recentReviews, ...reviews(10)] }), cfg)).toBe(
      true,
    );
  });

  it('only times correct answers', () => {
    const recentReviews = [
      ...reviews(30, { responseMs: 1100 }),
      ...reviews(3, { correct: false, rating: Rating.Again, responseMs: 9000 }),
    ];
    expect(isSpeedDemon(ctx({ recentReviews }), cfg)).toBe(true);
  });
});
