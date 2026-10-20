import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../config';
import type { ReviewLogRecord } from '../../model';
import { SKILLS } from '../../skills';
import { DRILLS } from '../../../drills/registry';
import { d17DescribeAnswer } from '../../../drills/d17-play-sequence/logic';
import { MIC_DRILLS, MIC_SKILLS, isGiveUp } from '../achievements/mic-drills';
import { QUEST_TEMPLATES, drawQuests, type QuestAnswer, type QuestDayContext } from './index';
import tryMic from './try-mic';

const DATE = '2026-10-18';
const { target, bonusXp } = ENGINE_CONFIG.quests['try-mic'];

function review(over: Partial<ReviewLogRecord> = {}): ReviewLogRecord {
  return {
    itemId: 'find:A@s6',
    skillId: 'F2.string6-naturals',
    drillType: 'find-the-note',
    correct: true,
    responseMs: 800,
    rating: Rating.Easy,
    hintUsed: false,
    answerGiven: 'A',
    at: new Date(2026, 9, 17, 9),
    ...over,
  };
}

function answer(over: Partial<QuestAnswer> = {}): QuestAnswer {
  return {
    itemId: 'find:A@s6',
    skillId: 'F2.string6-naturals',
    correct: true,
    rating: Rating.Easy,
    kind: 'due',
    guided: false,
    at: new Date(2026, 9, 18, 9),
    drillType: 'play-the-note',
    ...over,
  };
}

const ctx = (answers: QuestAnswer[]): QuestDayContext => ({
  date: DATE,
  todaysReviews: [],
  dueRemaining: 0,
  skillStates: new Map(),
  answers,
});

const micSnapshot = { date: DATE, priorReviews: [review()], micEnabled: true };

describe('MIC_DRILLS', () => {
  it('names exactly the registered drills that need the mic', () => {
    expect(new Set(DRILLS.filter((d) => d.requiresMic).map((d) => d.id))).toEqual(MIC_DRILLS);
  });

  it('finds the skills a mic drill serves', () => {
    expect(MIC_SKILLS.has('F2.string6-naturals')).toBe(true);
    for (const id of MIC_SKILLS) {
      expect(SKILLS.find((s) => s.id === id)?.drillTypes.some((d) => MIC_DRILLS.has(d))).toBe(true);
    }
    expect(MIC_SKILLS.size).toBeLessThan(SKILLS.length);
  });
});

describe('try-mic quest', () => {
  it('is registered', () => {
    expect(QUEST_TEMPLATES).toContain(tryMic);
  });

  it('is drawn only in mic mode', () => {
    expect(tryMic.draw({ ...micSnapshot, micEnabled: false })).toBeNull();
    expect(tryMic.draw({ date: DATE, priorReviews: [review()] })).toBeNull();
    expect(tryMic.draw(micSnapshot)).toMatchObject({
      id: 'try-mic',
      templateId: 'try-mic',
      title: `Play ${target} answers on your guitar`,
      target,
      bonusXp,
    });
  });

  it('waits until the learner has practised a skill a mic drill serves', () => {
    expect(tryMic.draw({ ...micSnapshot, priorReviews: [] })).toBeNull();
    const notMic = SKILLS.find((s) => !MIC_SKILLS.has(s.id))!;
    expect(tryMic.draw({ ...micSnapshot, priorReviews: [review({ skillId: notMic.id })] })).toBe(
      null,
    );
  });

  it('counts answers played into the mic, right or wrong, guided or not', () => {
    const quest = tryMic.draw(micSnapshot)!;
    expect(quest.progress(ctx([]))).toBe(0);
    expect(
      quest.progress(
        ctx([
          answer(),
          answer({ correct: false, rating: Rating.Again, drillType: 'play-sequence' }),
          answer({ guided: true, kind: 'new' }),
        ]),
      ),
    ).toBe(3);
  });

  it('ignores tapped answers, not-due cards and answers with no drill', () => {
    const quest = tryMic.draw(micSnapshot)!;
    expect(
      quest.progress(
        ctx([
          answer({ drillType: 'find-the-note' }),
          answer({ kind: 'not-due' }),
          answer({ drillType: undefined }),
        ]),
      ),
    ).toBe(0);
  });

  it('ignores "Show me" give-ups, which need no guitar', () => {
    const quest = tryMic.draw(micSnapshot)!;
    const gaveUp = (played: number[]) =>
      answer({
        drillType: 'play-sequence',
        correct: false,
        rating: Rating.Again,
        answerGiven: d17DescribeAnswer({ played, gaveUp: true }),
      });
    const played = answer({
      drillType: 'play-sequence',
      correct: false,
      rating: Rating.Again,
      answerGiven: d17DescribeAnswer({ played: [55, 57] }),
    });
    expect(quest.progress(ctx([gaveUp([]), gaveUp([55, 57])]))).toBe(0);
    expect(quest.progress(ctx([gaveUp([]), played, answer({ answerGiven: 'A2' })]))).toBe(2);
  });

  it("spots D17's logged give-up, and only that", () => {
    expect(isGiveUp(d17DescribeAnswer({ played: [], gaveUp: true }))).toBe(true);
    expect(isGiveUp(d17DescribeAnswer({ played: [55], gaveUp: true }))).toBe(true);
    expect(isGiveUp(d17DescribeAnswer({ played: [55, 57] }))).toBe(false);
    expect(isGiveUp(undefined)).toBe(false);
  });

  it('caps progress at the target', () => {
    const quest = tryMic.draw(micSnapshot)!;
    expect(quest.progress(ctx(Array.from({ length: target + 4 }, () => answer())))).toBe(target);
  });

  it('joins the daily draw on some dates in mic mode, and never without it', () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    const drawn = (micEnabled: boolean) =>
      dates.filter((date) =>
        drawQuests({ date, priorReviews: [review()], micEnabled }, QUEST_TEMPLATES).some(
          (q) => q.id === 'try-mic',
        ),
      );
    expect(drawn(true).length).toBeGreaterThan(0);
    expect(drawn(false)).toEqual([]);
  });
});
