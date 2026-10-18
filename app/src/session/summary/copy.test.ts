import { describe, expect, it } from 'vitest';
import type { Celebration } from './celebrations';
import {
  LEARNED_HINT,
  SPACING_COPY,
  accuracyNote,
  competenceText,
  formatSeconds,
  headline,
  personalBestText,
} from './copy';

const base: Celebration = {
  answered: 10,
  accuracy: 0.85,
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

describe('SPACING_COPY', () => {
  it('says to come back tomorrow and why', () => {
    expect(SPACING_COPY).toMatch(/^Come back tomorrow/);
    expect(SPACING_COPY).toMatch(/sticks/);
  });
});
