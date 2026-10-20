import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../config';
import type { ReviewLogRecord } from '../../model';
import { DEFAULT_GAMIFICATION } from '../../../storage/gamification-model';
import type { AchievementContext } from '../types';
import { checkAchievements } from './check';
import { ACHIEVEMENTS } from './index';
import { MIC_ACCURACY_COPY, isMicDrill, micAchievement, playsWell } from './mic-drills';
import micNotes from './mic-notes';
import micSequences from './mic-sequences';

const { minAnswers, minAccuracy } = ENGINE_CONFIG.micBadges;
const at = new Date('2026-10-18T09:00:00Z');

function review(over: Partial<ReviewLogRecord> = {}): ReviewLogRecord {
  return {
    itemId: 'find:A@s6',
    skillId: 'F2.string6-naturals',
    drillType: 'play-the-note',
    correct: true,
    responseMs: 1500,
    rating: Rating.Good,
    hintUsed: false,
    answerGiven: 'A2',
    at,
    ...over,
  };
}

const reviews = (n: number, over: Partial<ReviewLogRecord> = {}) =>
  Array.from({ length: n }, () => review(over));

const ctx = (recentReviews: ReviewLogRecord[]): AchievementContext => ({
  skillStates: new Map(),
  gamification: DEFAULT_GAMIFICATION,
  recentReviews,
});

/** `n` answers from `drillType`, `wrong` of them wrong. */
function sample(n: number, wrong: number, drillType = 'play-the-note'): ReviewLogRecord[] {
  return [...reviews(n - wrong, { drillType }), ...reviews(wrong, { drillType, correct: false })];
}

describe('isMicDrill', () => {
  it('knows the mic drills by id', () => {
    expect(isMicDrill('play-the-note')).toBe(true);
    expect(isMicDrill('play-sequence')).toBe(true);
    expect(isMicDrill('find-the-note')).toBe(false);
    expect(isMicDrill(undefined)).toBe(false);
  });
});

describe('playsWell', () => {
  it('needs enough unguided answers from the drill', () => {
    expect(playsWell(sample(minAnswers - 1, 0), 'play-the-note')).toBe(false);
    expect(playsWell(sample(minAnswers, 0), 'play-the-note')).toBe(true);
  });

  it('needs the accuracy bar', () => {
    const allowed = Math.floor(minAnswers * (1 - minAccuracy) + 1e-9);
    expect(playsWell(sample(minAnswers, allowed), 'play-the-note')).toBe(true);
    expect(playsWell(sample(minAnswers, allowed + 1), 'play-the-note')).toBe(false);
  });

  it('leaves out guided reps and other drills', () => {
    const guided = reviews(minAnswers, { hintUsed: true });
    const tapped = reviews(minAnswers, { drillType: 'find-the-note' });
    expect(playsWell([...guided, ...tapped], 'play-the-note')).toBe(false);
    // A run of wrong guided reps doesn't pull a good sample under the bar.
    const wrongGuided = reviews(minAnswers, { hintUsed: true, correct: false });
    expect(playsWell([...sample(minAnswers, 0), ...wrongGuided], 'play-the-note')).toBe(true);
  });

  it('takes a custom bar', () => {
    expect(playsWell(sample(2, 1), 'play-the-note', { minAnswers: 2, minAccuracy: 0.5 })).toBe(
      true,
    );
  });
});

describe('mic badges', () => {
  it('are registered as competence badges outside the other badges’ order slots', () => {
    for (const badge of [micNotes, micSequences]) {
      expect(ACHIEVEMENTS).toContain(badge);
      expect(badge.category).toBe('mastery');
      expect(badge.description).toMatch(/^You /);
      expect(badge.description).toContain(MIC_ACCURACY_COPY);
      expect(badge.order).toBeGreaterThan(30);
      expect(badge.order).toBeLessThan(100);
    }
    expect(MIC_ACCURACY_COPY).toBe('9 times in 10');
  });

  it('unlock each from its own drill', () => {
    expect(micNotes.isUnlocked(ctx(sample(minAnswers, 0)))).toBe(true);
    expect(micSequences.isUnlocked(ctx(sample(minAnswers, 0)))).toBe(false);
    expect(micSequences.isUnlocked(ctx(sample(minAnswers, 0, 'play-sequence')))).toBe(true);
    expect(
      checkAchievements(ctx(sample(minAnswers, 0, 'play-sequence')), new Set(), ACHIEVEMENTS).map(
        (a) => a.id,
      ),
    ).toEqual(['mic-sequences']);
  });

  it('never unlock from volume alone', () => {
    expect(micNotes.isUnlocked(ctx(sample(50, 10)))).toBe(false);
  });

  it('builds from a drill id', () => {
    const badge = micAchievement({
      id: 'x',
      title: 'X',
      description: 'You x.',
      order: 1,
      drillType: 'play-sequence',
    });
    expect(badge).toMatchObject({ id: 'x', category: 'mastery', order: 1 });
    expect(badge).not.toHaveProperty('drillType');
  });
});
