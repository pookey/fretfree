import { describe, expect, it } from 'vitest';
import { Rating, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../config';
import type { ReviewLogRecord } from '../../model';
import { DEFAULT_GAMIFICATION } from '../../../storage/gamification-model';
import { emptyDailyProgress } from '../daily';
import { addDays } from '../local-date';
import type { CardKind } from '../types';
import clearDue from './clear-due';
import fixSlips from './fix-slips';
import fluentQuest from './fluent';
import { stringsOf } from './helpers';
import {
  QUEST_TEMPLATES,
  completeQuests,
  dateSeed,
  drawQuests,
  questStatuses,
  seededRng,
  templatesFrom,
  type DailyQuest,
  type QuestAnswer,
  type QuestDayContext,
  type QuestSnapshot,
  type QuestTemplate,
} from './index';
import mixItUp from './mix-it-up';
import newGround from './new-ground';
import weakSkillQuest, { weakSkill } from './weak-skill';
import weakStringsQuest, { weakStrings } from './weak-strings';

const DATE = '2026-10-18';
const cfg = ENGINE_CONFIG.quests;
let t = 0;

function review(over: Partial<ReviewLogRecord> = {}): ReviewLogRecord {
  return {
    itemId: 'note@s6f5',
    skillId: 'F2.string6-naturals',
    drillType: 'name-the-note',
    correct: true,
    responseMs: 800,
    rating: Rating.Easy,
    hintUsed: false,
    answerGiven: 'A',
    at: new Date(2026, 9, 10, 9, 0, t++),
    ...over,
  };
}

/** `n` copies of a review, e.g. to give a string or skill enough answers to judge. */
function reviews(n: number, over: Partial<ReviewLogRecord> = {}): ReviewLogRecord[] {
  return Array.from({ length: n }, () => review(over));
}

function answer(over: Partial<QuestAnswer> = {}): QuestAnswer {
  return {
    itemId: 'note@s6f5',
    skillId: 'F2.string6-naturals',
    correct: true,
    rating: Rating.Easy,
    kind: 'due',
    guided: false,
    at: new Date(2026, 9, 18, 9, 0, t++),
    ...over,
  };
}

function ctx(answers: QuestAnswer[], over: Partial<QuestDayContext> = {}): QuestDayContext {
  return {
    date: DATE,
    todaysReviews: [],
    dueRemaining: 0,
    skillStates: new Map(),
    answers,
    ...over,
  };
}

const snap = (priorReviews: ReviewLogRecord[] = [], date = DATE): QuestSnapshot => ({
  date,
  priorReviews,
  micEnabled: true,
});

function drawn(template: QuestTemplate, snapshot: QuestSnapshot = snap([review()])): DailyQuest {
  const q = template.draw(snapshot);
  if (!q) throw new Error(`${template.id} did not apply`);
  return q;
}

/** A history judging every string and several skills, so every quest applies. */
function richHistory(): ReviewLogRecord[] {
  return [1, 2, 3, 4, 5, 6].flatMap((s) =>
    reviews(cfg.minAreaAnswers, {
      itemId: `note@s${s}f3`,
      skillId: s >= 5 ? `F2.string${s}-naturals` : 'C2.all-notes',
      rating: s === 3 ? Rating.Hard : Rating.Easy,
    }),
  );
}

describe('the quest registry', () => {
  it('has one template per quest file, by id', () => {
    expect(QUEST_TEMPLATES.map((q) => q.id)).toEqual([
      'clear-due',
      'fix-slips',
      'fluent',
      'mix-it-up',
      'new-ground',
      'try-mic',
      'weak-skill',
      'weak-strings',
    ]);
  });

  it('ignores modules without a default export', () => {
    expect(templatesFrom({ './helpers.ts': {}, './b.ts': { default: clearDue } })).toEqual([
      clearDue,
    ]);
  });

  it('takes every target and bonus from the config', () => {
    for (const t of QUEST_TEMPLATES) {
      const q = t.draw(snap(richHistory()))!;
      expect(q.templateId).toBe(t.id);
      expect(q.target).toBe(cfg[t.id as 'fluent'].target);
      expect(q.bonusXp).toBe(cfg[t.id as 'fluent'].bonusXp);
    }
  });
});

describe('drawQuests', () => {
  it('draws three quests deterministically from the date', () => {
    const a = drawQuests(snap(richHistory()), QUEST_TEMPLATES).map((q) => q.id);
    const b = drawQuests(snap(richHistory()), [...QUEST_TEMPLATES].reverse()).map((q) => q.id);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(b).toEqual(a);
  });

  it('rotates from day to day, drawing every quest over a month', () => {
    const history = richHistory();
    const sets = new Set<string>();
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      const ids = drawQuests(snap(history, addDays(DATE, d)), QUEST_TEMPLATES).map(
        (q) => q.templateId,
      );
      sets.add([...ids].sort().join());
      ids.forEach((id) => seen.add(id));
    }
    expect(sets.size).toBeGreaterThan(5);
    expect([...seen].sort()).toEqual(QUEST_TEMPLATES.map((q) => q.id));
  });

  it('only draws quests that apply, so a first day gets the everyday ones', () => {
    const ids = drawQuests(snap([]), QUEST_TEMPLATES).map((q) => q.id);
    expect(ids.sort()).toEqual(['fix-slips', 'fluent', 'new-ground']);
  });

  it('draws fewer when fewer apply, and honours perDay', () => {
    expect(drawQuests(snap([]), [clearDue, fluentQuest])).toHaveLength(1);
    expect(drawQuests(snap(richHistory()), QUEST_TEMPLATES, 2)).toHaveLength(2);
  });

  it('seeds the same date the same way and different dates differently', () => {
    expect(dateSeed(DATE)).toBe(dateSeed(DATE));
    expect(dateSeed(DATE)).not.toBe(dateSeed(addDays(DATE, 1)));
    const r1 = seededRng(42);
    const r2 = seededRng(42);
    const xs = Array.from({ length: 5 }, () => r1());
    expect(Array.from({ length: 5 }, () => r2())).toEqual(xs);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of xs) expect(x).toBeLessThan(1);
  });
});

describe('clear-due', () => {
  it('needs history before the date', () => {
    expect(clearDue.draw(snap([]))).toBeNull();
  });

  it('is done once nothing is due and something was practised', () => {
    const q = drawn(clearDue);
    expect(q.progress(ctx([]))).toBe(0);
    expect(q.progress(ctx([answer()], { dueRemaining: 2 }))).toBe(0);
    expect(q.progress(ctx([answer()]))).toBe(1);
  });

  it('is not cleared by drilling stable cards early', () => {
    expect(drawn(clearDue).progress(ctx([answer({ kind: 'not-due' })]))).toBe(0);
  });
});

describe('new-ground', () => {
  const q = drawn(newGround, snap([]));

  it('counts new items recalled on their own, once each', () => {
    const answers = [
      answer({ itemId: 'a', kind: 'new', guided: true, rating: Rating.Hard }),
      answer({ itemId: 'a', kind: 'new' }),
      answer({ itemId: 'a', kind: 'due' }),
      answer({ itemId: 'b', kind: 'new', guided: true, rating: Rating.Hard }),
      // A learning-step reappearance of a new item counts.
      answer({ itemId: 'b', kind: 'due', rating: Rating.Good }),
    ];
    expect(q.progress(ctx(answers))).toBe(2);
  });

  it('does not count a worked example alone, or old items', () => {
    const answers = [
      answer({ itemId: 'a', kind: 'new', guided: true, rating: Rating.Hard }),
      answer({ itemId: 'b', kind: 'due' }),
    ];
    expect(q.progress(ctx(answers))).toBe(0);
  });

  it('caps progress at the target', () => {
    const answers = ['a', 'b', 'c', 'd', 'e'].map((itemId) => answer({ itemId, kind: 'new' }));
    expect(q.progress(ctx(answers))).toBe(q.target);
  });
});

describe('fluent', () => {
  const q = drawn(fluentQuest, snap([]));

  it('counts distinct items answered right, quickly and unguided', () => {
    const answers = [
      answer({ itemId: 'a' }),
      answer({ itemId: 'a' }),
      answer({ itemId: 'b', rating: Rating.Good }),
      answer({ itemId: 'c', correct: false, rating: Rating.Again }),
      answer({ itemId: 'd', kind: 'stretch' }),
      answer({ itemId: 'e', kind: 'not-due' }),
    ];
    expect(q.progress(ctx(answers))).toBe(2);
  });
});

describe('fix-slips', () => {
  const q = drawn(fixSlips, snap([]));

  it('counts items recalled after being missed today', () => {
    const answers = [
      answer({ itemId: 'a', correct: false, rating: Rating.Again }),
      answer({ itemId: 'b' }),
      answer({ itemId: 'a', rating: Rating.Good }),
      answer({ itemId: 'a' }),
      answer({ itemId: 'c', correct: false, rating: Rating.Again }),
    ];
    expect(q.progress(ctx(answers))).toBe(1);
  });

  it('needs the hit after the miss, and unguided', () => {
    const answers = [
      answer({ itemId: 'a' }),
      answer({ itemId: 'a', correct: false, rating: Rating.Again }),
      answer({ itemId: 'b', correct: false, rating: Rating.Again }),
      answer({ itemId: 'b', guided: true, rating: Rating.Hard }),
    ];
    expect(q.progress(ctx(answers))).toBe(0);
  });
});

describe('mix-it-up', () => {
  it('needs history in at least as many skills as the target', () => {
    expect(mixItUp.draw(snap(reviews(5)))).toBeNull();
    expect(mixItUp.draw(snap(richHistory()))).not.toBeNull();
  });

  it('counts distinct skills with a recalled answer', () => {
    const q = drawn(mixItUp, snap(richHistory()));
    const answers = [
      answer({ skillId: 'x' }),
      answer({ skillId: 'x' }),
      answer({ skillId: 'y', rating: Rating.Hard }),
      answer({ skillId: 'z', guided: true, rating: Rating.Hard }),
      answer({ skillId: 'w', kind: 'not-due' }),
    ];
    expect(q.progress(ctx(answers))).toBe(2);
  });
});

describe('weak-strings', () => {
  it('maps items to the strings they are played on', () => {
    expect(stringsOf('note@s3f5')).toEqual([3]);
    expect(stringsOf('find:G@s4')).toEqual([4]);
    expect(stringsOf('octave:s6f3→s4')).toEqual([6, 4]);
    expect(stringsOf('interval:P5@s5→s4')).toEqual([5, 4]);
    expect(stringsOf('step:+2@E')).toEqual([]);
    expect(stringsOf('nonsense')).toEqual([]);
  });

  it('needs two judged strings to compare', () => {
    expect(weakStrings(snap([]))).toBeNull();
    expect(weakStrings(snap(reviews(cfg.minAreaAnswers)))).toBeNull();
    // String 5 has too few answers to judge.
    const history = [
      ...reviews(cfg.minAreaAnswers),
      ...reviews(cfg.minAreaAnswers - 1, { itemId: 'note@s5f3' }),
    ];
    expect(weakStrings(snap(history))).toBeNull();
    expect(weakStringsQuest.draw(snap(history))).toBeNull();
  });

  it('picks the single least fluent string when only two are judged', () => {
    const history = [
      ...reviews(cfg.minAreaAnswers, { itemId: 'note@s6f3' }),
      ...reviews(cfg.minAreaAnswers, { itemId: 'note@s5f3', rating: Rating.Good }),
    ];
    expect(weakStrings(snap(history))).toEqual([5]);
    const q = drawn(weakStringsQuest, snap(history));
    expect(q.id).toBe('weak-strings:5');
    expect(q.title).toBe(`${q.target} fluent answers on string 5`);
  });

  it('pairs the weakest string with its weaker judged neighbour', () => {
    const history = richHistory();
    // String 3 is least fluent; string 4 is less accurate than string 2.
    history.push(...reviews(2, { itemId: 'note@s4f3', correct: false, rating: Rating.Again }));
    expect(weakStrings(snap(history))).toEqual([3, 4]);
    const q = drawn(weakStringsQuest, snap(history));
    expect(q.id).toBe('weak-strings:3-4');
    expect(q.title).toBe(`${q.target} fluent answers on strings 3–4`);
  });

  it('ignores guided reps when judging', () => {
    const history = [
      ...reviews(cfg.minAreaAnswers, { itemId: 'note@s6f3' }),
      ...reviews(cfg.minAreaAnswers, { itemId: 'note@s5f3' }),
      ...reviews(20, { itemId: 'note@s6f3', hintUsed: true, rating: Rating.Hard }),
    ];
    // Tied on fluency and accuracy: the lower string number wins the tie.
    expect(weakStrings(snap(history))).toEqual([5]);
  });

  it('counts fluent answers on those strings', () => {
    const q = drawn(weakStringsQuest, snap(richHistory()));
    expect(q.id).toBe('weak-strings:2-3');
    const answers = [
      answer({ itemId: 'note@s3f2' }),
      answer({ itemId: 'note@s3f2' }),
      answer({ itemId: 'find:G@s2' }),
      answer({ itemId: 'interval:P5@s4→s3' }),
      answer({ itemId: 'note@s3f2', rating: Rating.Good }),
      answer({ itemId: 'note@s6f2' }),
      answer({ itemId: 'note@s3f4', kind: 'not-due' }),
    ];
    expect(q.progress(ctx(answers))).toBe(4);
  });
});

describe('weak-skill', () => {
  it('needs two judged skills to compare', () => {
    expect(weakSkill(snap(reviews(cfg.minAreaAnswers)))).toBeNull();
    expect(weakSkillQuest.draw(snap([]))).toBeNull();
  });

  it('picks the least accurate skill and names it', () => {
    const history = [
      ...reviews(cfg.minAreaAnswers),
      ...reviews(cfg.minAreaAnswers, { skillId: 'F2.string5-naturals', correct: false }),
    ];
    expect(weakSkill(snap(history))).toBe('F2.string5-naturals');
    const q = drawn(weakSkillQuest, snap(history));
    expect(q.id).toBe('weak-skill:F2.string5-naturals');
    expect(q.title).toBe(`Get ${q.target} right: Natural notes on string 5`);
  });

  it('breaks ties on fluency, then id, and falls back to the id as a title', () => {
    const history = [
      ...reviews(cfg.minAreaAnswers, { skillId: 'b' }),
      ...reviews(cfg.minAreaAnswers, { skillId: 'a' }),
      ...reviews(cfg.minAreaAnswers, { skillId: 'c', rating: Rating.Good }),
    ];
    expect(weakSkill(snap(history))).toBe('c');
    expect(weakSkill(snap(history.filter((r) => r.skillId !== 'c')))).toBe('a');
    expect(drawn(weakSkillQuest, snap(history)).title).toBe(`Get 8 right: c`);
  });

  it('counts recalled answers in that skill', () => {
    const history = [
      ...reviews(cfg.minAreaAnswers),
      ...reviews(cfg.minAreaAnswers, { skillId: 'F2.string5-naturals', correct: false }),
    ];
    const q = drawn(weakSkillQuest, snap(history));
    const answers = [
      answer({ skillId: 'F2.string5-naturals', rating: Rating.Hard }),
      answer({ skillId: 'F2.string5-naturals', guided: true, rating: Rating.Hard }),
      answer({ skillId: 'F2.string5-naturals', kind: 'not-due' }),
      answer({ skillId: 'F2.string6-naturals' }),
    ];
    expect(q.progress(ctx(answers))).toBe(1);
  });
});

describe('the guardrail: no quest pays for drilling stable cards early', () => {
  const KINDS: CardKind[] = ['new', 'due', 'stretch', 'not-due'];
  const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

  it('never moves progress for not-due answers (property)', () => {
    const rng = seededRng(7);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
    const items = ['note@s3f2', 'note@s4f5', 'find:G@s3', 'note@s6f1', 'step:+2@E'];
    const skills = ['C2.all-notes', 'F2.string6-naturals', 'F1.alphabet'];
    const drills = ['find-the-note', 'play-the-note', 'play-sequence'];
    const quests = QUEST_TEMPLATES.map((t) => t.draw(snap(richHistory()))!);
    for (let run = 0; run < 200; run++) {
      const base = Array.from({ length: Math.floor(rng() * 12) }, () => {
        const rating = pick(GRADES);
        return answer({
          itemId: pick(items),
          skillId: pick(skills),
          kind: pick(KINDS),
          rating,
          correct: rating !== Rating.Again,
          guided: rng() < 0.2,
          drillType: pick(drills),
        });
      });
      const grind = Array.from({ length: 20 }, () =>
        answer({
          itemId: pick(items),
          skillId: pick(skills),
          kind: 'not-due',
          drillType: pick(drills),
        }),
      );
      // Interleave the grind at random, keeping the base answers in order.
      const mixed: QuestAnswer[] = [];
      const queues = [[...base], grind];
      while (queues[0]!.length + queues[1]!.length > 0) {
        const from = queues[0]!.length === 0 || (queues[1]!.length > 0 && rng() < 0.5) ? 1 : 0;
        mixed.push(queues[from]!.shift()!);
      }
      for (const q of quests) expect(q.progress(ctx(mixed))).toBe(q.progress(ctx(base)));
    }
  });

  it('keeps every bonus within two fluent due answers', () => {
    const maxAnswerXp =
      ENGINE_CONFIG.gamification.xp.attempt +
      ENGINE_CONFIG.gamification.xp.correctBonus +
      ENGINE_CONFIG.gamification.xp.fluentBonus;
    for (const t of QUEST_TEMPLATES) {
      const q = t.draw(snap(richHistory()))!;
      expect(q.bonusXp).toBeGreaterThan(0);
      expect(q.bonusXp).toBeLessThanOrEqual(2 * maxAnswerXp);
    }
  });
});

describe('questStatuses', () => {
  it('reports progress, and keeps a completed quest done', () => {
    const q = drawn(fluentQuest, snap([]));
    const [open] = questStatuses([q], ctx([answer({ itemId: 'a' })]), []);
    expect(open).toMatchObject({ progress: 1, done: false });
    const [kept] = questStatuses([q], ctx([]), [q.id]);
    expect(kept).toMatchObject({ progress: q.target, done: true });
  });
});

describe('completeQuests', () => {
  const q = drawn(clearDue);
  const other = drawn(fluentQuest, snap([]));
  const state = { ...DEFAULT_GAMIFICATION, xpTotal: 100 };
  const day = { ...emptyDailyProgress(DATE), xp: 40 };

  it('awards bonus XP to the total and the day, with one event per quest', () => {
    const r = completeQuests(state, day, [q, other], ctx([answer()]));
    expect(r.events).toEqual([
      { type: 'quest-completed', date: DATE, questId: 'clear-due', xp: q.bonusXp },
    ]);
    expect(r.state.xpTotal).toBe(100 + q.bonusXp);
    expect(r.day.xp).toBe(40 + q.bonusXp);
    expect(r.day.questsCompleted).toEqual(['clear-due']);
  });

  it('never pays a quest twice', () => {
    const once = completeQuests(state, day, [q], ctx([answer()]));
    const twice = completeQuests(once.state, once.day, [q], ctx([answer()]));
    expect(twice.events).toEqual([]);
    expect(twice.state).toBe(once.state);
    expect(twice.day).toBe(once.day);
  });

  it('awards nothing below target', () => {
    const r = completeQuests(state, day, [q], ctx([], { dueRemaining: 3 }));
    expect(r).toEqual({ state, day, events: [] });
  });
});
