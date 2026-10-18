import { describe, expect, it } from 'vitest';
import { Rating, State, createEmptyCard } from 'ts-fsrs';
import {
  ENGINE_CONFIG,
  SKILLS,
  createScheduler,
  type CardRecord,
  type ReviewLogRecord,
  type Skill,
  type SkillStatus,
} from '../../engine';
import {
  bestPastSpeedMs,
  buildCelebration,
  competenceGains,
  improvedItems,
  isKnown,
  isLearned,
  isPerfect,
  nextCombo,
  sessionProgress,
  sessionSpeedMs,
  stringReach,
  type Snapshot,
  type TalliedAnswer,
} from './celebrations';
import { toLocalDate } from '../../engine/gamification';

const CFG = ENGINE_CONFIG.gamification.celebrations;
const T0 = new Date('2026-10-18T09:00:00Z');
const STRING6 = SKILLS.find((s) => s.id === 'F2.string6-naturals') as Skill;
const STRING5 = SKILLS.find((s) => s.id === 'F2.string5-naturals') as Skill;
const ALL = SKILLS.find((s) => s.id === 'C2.all-notes') as Skill;
// Natural notes on string 6: E F G A B C D E.
const S6_FRETS = [0, 1, 3, 5, 7, 8, 10, 12];

const DAY = 86_400_000;

/** A card introduced two days ago and recalled at T0: recall across a gap. */
function card(
  itemId: string,
  stability: number,
  state: State = State.Review,
  createdAt = new Date(T0.getTime() - 2 * DAY),
): CardRecord {
  return {
    itemId,
    skillId: 'F2.string6-naturals',
    fsrs: { ...createEmptyCard(T0), state, stability },
    createdAt,
    lastReviewedAt: T0,
  };
}

/** A card introduced and graduated in today's session. */
function sameDay(itemId: string, stability: number): CardRecord {
  return card(itemId, stability, State.Review, T0);
}

function cards(...list: CardRecord[]): Map<string, CardRecord> {
  return new Map(list.map((c) => [c.itemId, c]));
}

function snap(list: CardRecord[] = [], statuses: [string, SkillStatus][] = []): Snapshot {
  return { cards: cards(...list), statuses: new Map(statuses) };
}

function ans(over: Partial<TalliedAnswer> = {}): TalliedAnswer {
  return {
    itemId: 'note@s6f0',
    skillId: 'F2.string6-naturals',
    kind: 'review',
    guided: false,
    correct: true,
    rating: Rating.Good,
    responseMs: 1000,
    ...over,
  };
}

const s6 = (fret: number) => `note@s6f${fret}`;

describe('nextCombo', () => {
  it('counts correct unguided answers, holds on guided reps and resets on a miss', () => {
    expect(nextCombo(2, { correct: true, guided: false })).toBe(3);
    expect(nextCombo(2, { correct: true, guided: true })).toBe(2);
    expect(nextCombo(5, { correct: false, guided: false })).toBe(0);
    expect(nextCombo(5, { correct: false, guided: true })).toBe(0);
  });
});

describe('improvedItems', () => {
  it('counts items whose stability rose and whose last answer was correct', () => {
    const before = cards(card(s6(0), 3), card(s6(1), 3), card(s6(3), 3));
    const after = cards(card(s6(0), 9), card(s6(1), 9), card(s6(3), 1), card(s6(5), 2));
    const answers = [
      ans({ itemId: s6(0) }),
      ans({ itemId: s6(1) }),
      ans({ itemId: s6(1), correct: false }), // ended on a miss
      ans({ itemId: s6(3), correct: false }),
      ans({ itemId: s6(3) }), // retried correctly, but stability fell
      ans({ itemId: s6(5), kind: 'new' }), // new item: from nothing to something
      ans({ itemId: s6(7) }), // no card afterwards
    ];
    expect(improvedItems(before, after, answers)).toEqual([s6(0), s6(5)]);
  });
});

describe('isLearned / isKnown', () => {
  it('needs a graduated review card with enough stability', () => {
    expect(isKnown(undefined, CFG)).toBe(false);
    expect(isKnown(card('x', 5, State.Learning), CFG)).toBe(false);
    expect(isKnown(card('x', 5, State.Relearning), CFG)).toBe(false);
    expect(isKnown(card('x', 0.5), CFG)).toBe(false);
    expect(isKnown(card('x', 1), CFG)).toBe(true);
    expect(isLearned(card('x', 1), CFG)).toBe(true);
  });

  it('only calls an item known once it was recalled on a later day than it was introduced', () => {
    expect(isLearned(sameDay('x', 8), CFG)).toBe(true);
    expect(isKnown(sameDay('x', 8), CFG)).toBe(false);
    expect(isKnown({ ...card('x', 8), lastReviewedAt: null }, CFG)).toBe(false);
    expect(isKnown(card('x', 8, State.Review, new Date(T0.getTime() - DAY)), CFG)).toBe(true);
    expect(isKnown(sameDay('x', 8), { ...CFG, knownAfterGapDays: 0 })).toBe(true);
  });

  it('does not treat a first-session Easy answer as known', () => {
    // ts-fsrs short-term scheduling sends a new card rated Easy straight to Review (~8 days).
    const scheduler = createScheduler({ enableFuzz: false });
    const item = { id: s6(0), skillId: STRING6.id };
    const guided = scheduler.review(scheduler.newCard(item, T0), Rating.Hard, T0);
    const t1 = new Date(T0.getTime() + 60_000);
    const easy = scheduler.review(scheduler.review(guided, Rating.Easy, t1), Rating.Easy, t1);
    expect(easy.fsrs.state).toBe(State.Review);
    expect(isLearned(easy, CFG)).toBe(true);
    expect(isKnown(easy, CFG)).toBe(false);
    // Recalled again two days later: now it is known.
    const later = scheduler.review(easy, Rating.Good, new Date(T0.getTime() + 2 * DAY));
    expect(isKnown(later, CFG)).toBe(true);
  });
});

describe('stringReach', () => {
  it('is the contiguous known run from the lowest fret, per string', () => {
    const known = new Set([s6(0), s6(1), s6(3), s6(7)]);
    const reach = stringReach(STRING6, (id) => known.has(id));
    expect(reach.get(6)).toEqual({ toFret: 3, lastFret: 12 });
    expect(stringReach(STRING6, () => false).get(6)).toEqual({ toFret: -1, lastFret: 12 });
  });

  it('ignores items that are not note positions', () => {
    const skill: Skill = { ...STRING6, items: () => [{ id: 'other', skillId: STRING6.id }] };
    expect(stringReach(skill, () => true).size).toBe(0);
  });
});

describe('competenceGains', () => {
  const known = (frets: number[]) => frets.map((f) => card(s6(f), 5));

  it('reports a string whose known reach grew', () => {
    const lines = competenceGains(
      [STRING6, STRING5],
      snap(known([0, 1])),
      snap(known([0, 1, 3, 5])),
      CFG,
    );
    expect(lines).toEqual([
      {
        kind: 'reach',
        skillId: STRING6.id,
        skillTitle: STRING6.title,
        string: 6,
        toFret: 5,
        complete: false,
      },
    ]);
  });

  it('marks a whole string as complete', () => {
    const [line] = competenceGains([STRING6], snap(known([0])), snap(known(S6_FRETS)), CFG);
    expect(line).toMatchObject({ kind: 'reach', string: 6, toFret: 12, complete: true });
  });

  it('reports nothing when the reach did not grow', () => {
    expect(competenceGains([STRING6], snap(known([0, 1])), snap(known([0, 1])), CFG)).toEqual([]);
    expect(competenceGains([STRING6], snap(), snap(known([1, 3])), CFG)).toEqual([]);
  });

  it('puts newly mastered skills first and drops their reach lines', () => {
    // Every item of the skill, both directions (name the note, find the note).
    const everyItem = STRING6.items().map((i) => card(i.id, 5));
    const lines = competenceGains(
      [STRING6],
      snap([], [[STRING6.id, 'practising']]),
      snap(everyItem, [[STRING6.id, 'mastered']]),
      CFG,
    );
    expect(lines).toEqual([{ kind: 'mastered', skillId: STRING6.id, skillTitle: STRING6.title }]);
    // Only one direction known: not mastered yet, but the whole string is.
    expect(
      competenceGains(
        [STRING6],
        snap([], [[STRING6.id, 'practising']]),
        snap(known(S6_FRETS), [[STRING6.id, 'mastered']]),
        CFG,
      ),
    ).toEqual([expect.objectContaining({ kind: 'reach', string: 6, toFret: 12, complete: true })]);
    // Already mastered before: not news.
    expect(
      competenceGains(
        [STRING6],
        snap(known(S6_FRETS), [[STRING6.id, 'mastered']]),
        snap(known(S6_FRETS), [[STRING6.id, 'mastered']]),
        CFG,
      ),
    ).toEqual([]);
  });

  it('reports same-day gains as learned, not known, after any known reach', () => {
    const lines = competenceGains(
      [STRING6],
      snap(known([0])),
      snap([...known([0, 1]), sameDay(s6(3), 8), sameDay(s6(5), 8)]),
      CFG,
    );
    expect(lines).toEqual([
      expect.objectContaining({ kind: 'reach', string: 6, toFret: 1 }),
      expect.objectContaining({ kind: 'learned', string: 6, toFret: 5, complete: false }),
    ]);
    // Learned already before the session: not news.
    const learned = [sameDay(s6(0), 8), sameDay(s6(1), 8)];
    expect(competenceGains([STRING6], snap(learned), snap(learned), CFG)).toEqual([]);
  });

  it('drops a learned line where another skill already knows the string as far', () => {
    const s5 = (f: number) => `note@s5f${f}`;
    const after = snap([card(s5(0), 5), sameDay(s5(1), 5), card(s5(2), 5), card(s5(3), 5)]);
    // C2 (every note) knows only the open string but has learned to fret 3 today;
    // F2's string-5 naturals (frets 0, 2, 3) are known to fret 3, so C2's line adds nothing.
    const lines = competenceGains([ALL, STRING5], snap(), after, CFG);
    expect(lines.map((l) => (l.kind === 'mastered' ? l : [l.kind, l.skillId, l.toFret]))).toEqual([
      ['reach', STRING5.id, 3],
    ]);
  });

  it('does not celebrate mastery that was crammed into one day', () => {
    const lines = competenceGains(
      [STRING6],
      snap([], [[STRING6.id, 'practising']]),
      snap(
        S6_FRETS.map((f) => sameDay(s6(f), 9)),
        [[STRING6.id, 'mastered']],
      ),
      CFG,
    );
    expect(lines).toEqual([
      expect.objectContaining({ kind: 'learned', string: 6, toFret: 12, complete: true }),
    ]);
  });

  it('keeps the furthest reach per string across skills, strings high to low', () => {
    const s5 = [0, 2, 3].map((f) => card(`note@s5f${f}`, 5));
    const lines = competenceGains(
      [ALL, STRING6, STRING5],
      snap(),
      snap([...known([0, 1, 3]), ...s5]),
      CFG,
    );
    // C2 needs every fret on string 6 (reach 1); F2 naturals reach 3.
    expect(lines.map((l) => (l.kind === 'reach' ? [l.skillId, l.string, l.toFret] : l))).toEqual([
      [STRING6.id, 6, 3],
      [STRING5.id, 5, 3],
    ]);
  });
});

describe('sessionSpeedMs', () => {
  it('is the median of correct unguided answers, once there are enough', () => {
    const answers = [
      ans({ responseMs: 900 }),
      ans({ responseMs: 1100 }),
      ans({ responseMs: 1300 }),
      ans({ responseMs: 200, guided: true }),
      ans({ responseMs: 5000, correct: false }),
    ];
    expect(sessionSpeedMs(answers, 3)).toBe(1100);
    expect(sessionSpeedMs(answers, 4)).toBeNull();
  });
});

describe('bestPastSpeedMs', () => {
  const log = (at: Date, responseMs: number, over: Partial<ReviewLogRecord> = {}) => ({
    itemId: 'note@s6f0',
    skillId: STRING6.id,
    drillType: 'name-the-note',
    correct: true,
    responseMs,
    rating: Rating.Good,
    hintUsed: false,
    answerGiven: 'E',
    at,
    ...over,
  });
  const at = (min: number) => new Date(T0.getTime() + min * 60_000);

  it('groups reviews by session and returns the lowest qualifying median', () => {
    const starts = [at(0), at(100), at(200)];
    const reviews = [
      log(at(-5), 100), // before any session: ignored
      log(at(1), 1500),
      log(at(2), 1700),
      log(at(101), 1200),
      log(at(102), 1000),
      log(at(103), 300, { hintUsed: true }),
      log(at(201), 400), // only one answer: doesn't qualify
    ];
    expect(bestPastSpeedMs(starts, reviews, 2)).toBe(1100);
    expect(bestPastSpeedMs([...starts].reverse(), reviews, 2)).toBe(1100);
    expect(bestPastSpeedMs(starts, [...reviews].reverse(), 2)).toBe(1100);
    expect(bestPastSpeedMs(starts, reviews, 3)).toBeNull();
    expect(bestPastSpeedMs([], reviews, 1)).toBeNull();
  });
});

describe('isPerfect', () => {
  it('needs every answer right over enough unguided answers', () => {
    const eight = Array.from({ length: 8 }, () => ans());
    expect(isPerfect(eight, 8)).toBe(true);
    expect(isPerfect([...eight.slice(1), ans({ guided: true })], 8)).toBe(false);
    expect(isPerfect([...eight, ans({ correct: false })], 8)).toBe(false);
    expect(isPerfect([], 0)).toBe(true);
  });
});

describe('sessionProgress', () => {
  const today = toLocalDate(T0);
  const inDays = (days: number) => toLocalDate(new Date(T0.getTime() + days * DAY));
  /** A card due `days` from T0. */
  const due = (c: CardRecord, days: number): CardRecord => ({
    ...c,
    fsrs: { ...c.fsrs, due: new Date(T0.getTime() + days * DAY) },
  });

  it('counts a first session as learning, with nothing stable yet', () => {
    const after = cards(
      due(sameDay(s6(0), 2.3), 2),
      due(sameDay(s6(1), 2.3), 3),
      // A miss: its latest review was Again, so it isn't learning.
      due(card(s6(3), 0.3, State.Relearning, T0), 0),
    );
    const p = sessionProgress(
      new Map(),
      after,
      [
        ans({ itemId: s6(0) }),
        ans({ itemId: s6(1) }),
        ans({ itemId: s6(3), rating: Rating.Again }),
      ],
      today,
    );
    // The miss's learning step later today waits for tomorrow's session.
    expect(p).toEqual({
      learning: 2,
      stable: 0,
      becameStable: 0,
      nextReview: { date: inDays(1), inDays: 1 },
    });
  });

  it('uses the last answer per item, and the earliest later day for the forecast', () => {
    const after = cards(due(sameDay(s6(0), 2.3), 2), due(sameDay(s6(1), 2.3), 4));
    const p = sessionProgress(
      new Map(),
      after,
      [
        ans({ itemId: s6(0), rating: Rating.Again, correct: false }),
        ans({ itemId: s6(0) }),
        ans({ itemId: s6(1) }),
        ans({ itemId: s6(1), rating: Rating.Again, correct: false }),
      ],
      today,
    );
    expect(p.learning).toBe(1);
    expect(p.nextReview).toEqual({ date: inDays(2), inDays: 2 });
  });

  it('counts items that became stable this session apart from ones already stable', () => {
    const before = cards(card(s6(0), 3), card(s6(1), 20));
    const after = cards(due(card(s6(0), 9), 9), due(card(s6(1), 30), 30), due(card(s6(3), 3), 3));
    const p = sessionProgress(
      before,
      after,
      [ans({ itemId: s6(0) }), ans({ itemId: s6(1) }), ans({ itemId: s6(3) })],
      today,
    );
    expect(p).toEqual({
      learning: 3,
      stable: 2,
      becameStable: 1,
      nextReview: { date: inDays(3), inDays: 3 },
    });
  });

  it('has no forecast when nothing was answered or carded', () => {
    expect(sessionProgress(new Map(), new Map(), [ans()], today)).toEqual({
      learning: 0,
      stable: 0,
      becameStable: 0,
      nextReview: null,
    });
  });
});

describe('buildCelebration', () => {
  const summary = { itemsSeen: 10, accuracy: 0.9, newItems: 2 };
  const fast = Array.from({ length: 8 }, () => ans({ responseMs: 800 }));

  it('collects the numbers, moments and competence of a session', () => {
    const c = buildCelebration({
      summary,
      answers: fast,
      xp: 84,
      bestCombo: 8,
      skills: [STRING6],
      before: snap([card(s6(0), 3, State.Learning)]),
      after: snap([card(s6(0), 9)]),
      previousBestMs: 1000,
    });
    expect(c).toEqual({
      answered: 10,
      accuracy: 0.9,
      // Stability 3 → 9 days crosses stable; its next review is tomorrow at the earliest.
      progress: {
        learning: 1,
        stable: 1,
        becameStable: 1,
        nextReview: { date: toLocalDate(new Date(T0.getTime() + DAY)), inDays: 1 },
      },
      newItems: 2,
      xp: 84,
      itemsImproved: 1,
      bestCombo: 8,
      perfect: true,
      personalBest: { medianMs: 800, previousMs: 1000 },
      competence: [expect.objectContaining({ kind: 'reach', string: 6, toFret: 0 })],
      milestones: [],
      confetti: false,
    });
  });

  it('only claims a personal best against an earlier, slower session', () => {
    const base = {
      summary,
      answers: fast,
      xp: 0,
      bestCombo: 0,
      skills: [STRING6],
      before: snap(),
      after: snap(),
    };
    expect(buildCelebration({ ...base, previousBestMs: null }).personalBest).toBeNull();
    expect(buildCelebration({ ...base, previousBestMs: 800 }).personalBest).toBeNull();
    expect(
      buildCelebration({ ...base, answers: fast.slice(0, 2), previousBestMs: 5000 }).personalBest,
    ).toBeNull();
  });

  it('fires confetti only for milestones', () => {
    const base = {
      summary,
      answers: [ans({ correct: false })],
      xp: 6,
      bestCombo: 0,
      skills: [STRING6],
      before: snap(),
      previousBestMs: null,
    };
    const partial = buildCelebration({ ...base, after: snap([card(s6(0), 5)]) });
    expect(partial.competence).toHaveLength(1);
    expect(partial.confetti).toBe(false);

    const whole = S6_FRETS.map((f) => card(s6(f), 5));
    expect(buildCelebration({ ...base, after: snap(whole) }).confetti).toBe(true);
    // The whole string learned in one sitting: copy, but no confetti.
    const crammed = buildCelebration({
      ...base,
      after: snap(S6_FRETS.map((f) => sameDay(s6(f), 8))),
    });
    expect(crammed.competence).toEqual([
      expect.objectContaining({ kind: 'learned', complete: true }),
    ]);
    expect(crammed.confetti).toBe(false);
    expect(
      buildCelebration({ ...base, after: snap(whole, [[STRING6.id, 'mastered']]) }).confetti,
    ).toBe(true);
    const streak = buildCelebration({ ...base, after: snap(), milestones: ['7-day streak'] });
    expect(streak).toMatchObject({ confetti: true, milestones: ['7-day streak'] });
    // A perfect, fast session is a moment, not a milestone.
    expect(
      buildCelebration({ ...base, answers: fast, after: snap(), previousBestMs: 2000 }).confetti,
    ).toBe(false);
  });

  it('honours a custom config', () => {
    const c = buildCelebration({
      summary,
      answers: [ans()],
      xp: 0,
      bestCombo: 0,
      skills: [STRING6],
      before: snap(),
      after: snap(),
      previousBestMs: null,
      config: { ...CFG, perfectMinAnswers: 1 },
    });
    expect(c.perfect).toBe(true);
  });
});
