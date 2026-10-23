import { describe, expect, it } from 'vitest';
import type { Celebration, SessionProgress } from './celebrations';
import {
  LEARNED_HINT,
  SPACING_COPY,
  accuracyNote,
  competenceText,
  formatSeconds,
  headline,
  personalBestText,
  progressText,
  reviewDayText,
  streakMilestones,
} from './copy';

const base: Celebration = {
  answered: 10,
  accuracy: 0.85,
  progress: { learning: 0, stable: 0, becameStable: 0, nextReview: null },
  newItems: 0,
  xp: 0,
  itemsImproved: 0,
  bestCombo: 0,
  perfect: false,
  personalBest: null,
  competence: [],
  milestones: [],
  confetti: false,
};
const reach = (string: number, toFret: number) =>
  ({ kind: 'reach', skillId: 's', skillTitle: 'T', string, toFret, complete: false }) as const;

describe('competenceText', () => {
  it('names what the learner can now do', () => {
    expect(competenceText(reach(6, 12))).toBe('You now know string 6 to fret 12');
    expect(competenceText(reach(5, 0))).toBe('You now know open string 5');
    expect(competenceText({ ...reach(6, 5), kind: 'learned' })).toBe(
      'You learned string 6 to fret 5 today',
    );
    expect(competenceText({ ...reach(6, 0), kind: 'learned' })).toBe(
      'You learned open string 6 today',
    );
    expect(LEARNED_HINT).toMatch(/tomorrow/);
    expect(
      competenceText({ kind: 'mastered', skillId: 's', skillTitle: 'Natural notes on string 6' }),
    ).toBe("You've mastered natural notes on string 6");
  });
});

describe('headline', () => {
  it('leads with competence, then a perfect session, then plain completion', () => {
    expect(headline({ ...base, perfect: true, competence: [reach(6, 5)] })).toBe(
      'You now know string 6 to fret 5',
    );
    expect(headline({ ...base, perfect: true })).toBe('Perfect session');
    expect(headline(base)).toBe('Session complete');
  });
});

describe('accuracyNote', () => {
  it('frames misses as part of learning and stays quiet otherwise', () => {
    expect(accuracyNote(base)).toMatch(/learning zone/);
    expect(accuracyNote({ ...base, accuracy: 0.5 })).toMatch(/come back sooner/);
    expect(accuracyNote({ ...base, accuracy: 1 })).toBeNull();
    expect(accuracyNote({ ...base, answered: 0, accuracy: 0 })).toBeNull();
  });
});

describe('speed copy', () => {
  it('formats seconds with one decimal', () => {
    expect(formatSeconds(1234)).toBe('1.2s');
    expect(personalBestText({ medianMs: 1400, previousMs: 1700 })).toBe(
      'Median answer 1.4s, down from 1.7s',
    );
  });
});

describe('streakMilestones', () => {
  it('names streak milestones and ignores other events', () => {
    expect(
      streakMilestones([
        { type: 'streak-extended', date: '2026-10-18', streak: 30, milestone: 30 },
        { type: 'streak-extended', date: '2026-10-18', streak: 31 },
        { type: 'goal-met', date: '2026-10-18', minutes: 10, xp: 50 },
      ]),
    ).toEqual(['30-day streak: a real daily habit']);
  });
});

describe('SPACING_COPY', () => {
  it('says to come back tomorrow and why', () => {
    expect(SPACING_COPY).toMatch(/^Come back tomorrow/);
    expect(SPACING_COPY).toMatch(/sticks/);
  });
});

describe('reviewDayText', () => {
  it('says tomorrow, a weekday within the week, then a date', () => {
    // 2026-10-18 is a Sunday.
    expect(reviewDayText({ date: '2026-10-19', inDays: 1 })).toBe('tomorrow');
    expect(reviewDayText({ date: '2026-10-20', inDays: 2 })).toBe('Tuesday');
    expect(reviewDayText({ date: '2026-10-24', inDays: 6 })).toBe('Saturday');
    expect(reviewDayText({ date: '2026-11-03', inDays: 16 })).toBe('3 November');
    expect(reviewDayText({ date: 'soon', inDays: 9 })).toBe('soon');
  });
});

describe('progressText', () => {
  const tue = { date: '2026-10-20', inDays: 2 };
  const p = (over: Partial<SessionProgress>): SessionProgress => ({
    learning: 0,
    stable: 0,
    becameStable: 0,
    nextReview: tue,
    ...over,
  });

  it('is absent when nothing was answered', () => {
    expect(progressText(p({ nextReview: null }))).toBeNull();
  });

  it('explains spacing for a first session: learning, nothing stable yet', () => {
    expect(progressText(p({ learning: 14 }))).toBe(
      "14 cards learning. They become stable as you recall them over the next few days; today's cards come back Tuesday.",
    );
    expect(progressText(p({ learning: 1 }))).toBe(
      "1 card learning. It becomes stable as you recall it over the next few days; today's cards come back Tuesday.",
    );
  });

  it('names items that became stable without counting them twice', () => {
    expect(progressText(p({ learning: 14, stable: 3, becameStable: 3 }))).toBe(
      "14 cards learning, 3 of them newly stable. The rest become stable as you recall them over the next few days; today's cards come back Tuesday.",
    );
    expect(progressText(p({ learning: 6, stable: 5, becameStable: 2 }))).toBe(
      "6 cards learning, 5 of them stable (2 new today). The other one becomes stable as you recall it over the next few days; today's cards come back Tuesday.",
    );
    expect(progressText(p({ learning: 9, stable: 4 }))).toMatch(
      /^9 cards learning, 4 of them stable\. The rest/,
    );
  });

  it('celebrates an all-stable session', () => {
    expect(progressText(p({ learning: 3, stable: 3, becameStable: 3 }))).toBe(
      "3 cards became stable today. Each recall stretches the gap, and today's cards come back Tuesday.",
    );
    expect(progressText(p({ learning: 5, stable: 5, becameStable: 2 }))).toMatch(
      /^5 cards are stable, 2 of them new today\./,
    );
    expect(
      progressText(p({ learning: 1, stable: 1, nextReview: { date: '2026-11-03', inDays: 16 } })),
    ).toBe(
      "1 card is stable. Each recall stretches the gap, and today's cards come back on 3 November.",
    );
  });

  it('frames an all-miss session without loss', () => {
    const text = progressText(p({ nextReview: { date: '2026-10-19', inDays: 1 } }));
    expect(text).toBe(
      "One correct recall starts a card learning, and today's cards come back tomorrow.",
    );
    expect(text).not.toMatch(/lost|fail|0/);
  });
});
