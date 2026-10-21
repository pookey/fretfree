import { describe, expect, it } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import {
  deriveStatus,
  gatesOf,
  isFrontier,
  isMastered,
  meetsGate,
  median,
  nextGuideLevel,
  unmetGates,
} from './mastery';
import type { CardRecord, Skill, SkillStatus } from './model';

const targets = { targetMs: 2500, fluentTargetMs: 1500 };

function card(stability: number): CardRecord {
  const now = new Date('2026-10-18');
  return {
    itemId: `i${stability}-${Math.random()}`,
    skillId: 's',
    fsrs: { ...createEmptyCard(now), stability },
    createdAt: now,
    lastReviewedAt: now,
  };
}

describe('median', () => {
  it('handles empty, odd and even inputs', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('isMastered (design §3.4)', () => {
  const stable = Array.from({ length: 9 }, () => card(8));

  it('requires ≥90% of items stable for ≥7 days and median RT on target', () => {
    expect(
      isMastered({
        itemCount: 10,
        cards: [...stable, card(1)],
        recentResponseMs: [1000, 2000],
        targets,
      }),
    ).toBe(true);
  });

  it('counts unseen items against mastery', () => {
    expect(isMastered({ itemCount: 11, cards: stable, recentResponseMs: [1000], targets })).toBe(
      false,
    );
  });

  it('fails when the learner is still slow', () => {
    expect(
      isMastered({ itemCount: 9, cards: stable, recentResponseMs: [3000, 4000, 1000], targets }),
    ).toBe(false);
  });

  it('fails with no timing data or no items', () => {
    expect(isMastered({ itemCount: 9, cards: stable, recentResponseMs: [], targets })).toBe(false);
    expect(isMastered({ itemCount: 0, cards: [], recentResponseMs: [1], targets })).toBe(false);
  });
});

describe('deriveStatus (soft unlocking)', () => {
  const skill = (softUnlock?: boolean): Skill => ({
    id: 'b',
    topic: 'X',
    order: 0,
    title: 'B',
    prerequisites: ['a'],
    drillTypes: [],
    items: () => [],
    ...(softUnlock ? { softUnlock } : {}),
  });
  const m = (s?: SkillStatus) => new Map<string, SkillStatus>(s ? [['a', s]] : []);

  it('unlocks when prerequisites are mastered', () => {
    expect(deriveStatus(skill(), m('mastered'), undefined)).toBe('unlocked');
    expect(deriveStatus(skill(), m('practising'), 'locked')).toBe('locked');
    expect(deriveStatus(skill(), m(), undefined)).toBe('locked');
  });

  it('soft-unlocks low-risk skills once prerequisites are practising', () => {
    expect(deriveStatus(skill(true), m('practising'), undefined)).toBe('unlocked');
  });

  it('never demotes practising or mastered skills', () => {
    expect(deriveStatus(skill(), m(), 'practising')).toBe('practising');
    expect(deriveStatus(skill(), m(), 'mastered')).toBe('mastered');
  });

  it('marks frontier statuses', () => {
    expect(isFrontier('unlocked')).toBe(true);
    expect(isFrontier('practising')).toBe(true);
    expect(isFrontier('locked')).toBe(false);
    expect(isFrontier('mastered')).toBe(false);
  });
});

describe('mixed gates (soft prerequisites)', () => {
  // "a mastered, c practising": the hard gate stays hard.
  const mixed: Skill = {
    id: 'b',
    topic: 'X',
    order: 0,
    title: 'B',
    prerequisites: ['a'],
    softPrerequisites: ['c'],
    drillTypes: [],
    items: () => [],
  };
  const m = (a?: SkillStatus, c?: SkillStatus) =>
    new Map<string, SkillStatus>([
      ...(a ? [['a', a] as const] : []),
      ...(c ? [['c', c] as const] : []),
    ]);

  it('splits prerequisites into those to master and those to practise', () => {
    expect(gatesOf(mixed)).toEqual({ mastered: ['a'], practising: ['c'] });
    expect(gatesOf({ ...mixed, softPrerequisites: [] })).toEqual({
      mastered: ['a'],
      practising: [],
    });
    // `softUnlock` softens every one, as before.
    expect(gatesOf({ ...mixed, softUnlock: true })).toEqual({
      mastered: [],
      practising: ['a', 'c'],
    });
  });

  it('meets a hard gate only by mastery, a soft one by practice too', () => {
    expect(meetsGate('mastered', 'mastered')).toBe(true);
    expect(meetsGate('mastered', 'practising')).toBe(false);
    expect(meetsGate('practising', 'practising')).toBe(true);
    expect(meetsGate('practising', 'mastered')).toBe(true);
    expect(meetsGate('practising', 'unlocked')).toBe(false);
    expect(meetsGate('practising', undefined)).toBe(false);
  });

  it('unlocks once the hard prerequisite is mastered and the soft one practising', () => {
    expect(deriveStatus(mixed, m('mastered', 'practising'), undefined)).toBe('unlocked');
    expect(deriveStatus(mixed, m('mastered', 'mastered'), undefined)).toBe('unlocked');
  });

  it('stays locked while either gate is unmet', () => {
    expect(deriveStatus(mixed, m('practising', 'practising'), undefined)).toBe('locked');
    expect(deriveStatus(mixed, m('mastered', 'unlocked'), undefined)).toBe('locked');
    expect(deriveStatus(mixed, m('mastered'), undefined)).toBe('locked');
    expect(deriveStatus(mixed, m(), undefined)).toBe('locked');
  });

  it('names what is still unmet, hard gates first', () => {
    expect(unmetGates(mixed, m())).toEqual(['a', 'c']);
    expect(unmetGates(mixed, m('practising', 'practising'))).toEqual(['a']);
    expect(unmetGates(mixed, m('mastered', 'locked'))).toEqual(['c']);
    expect(unmetGates(mixed, m('mastered', 'practising'))).toEqual([]);
  });

  it('keeps softUnlock behaving exactly as before', () => {
    const soft = { ...mixed, softUnlock: true };
    expect(deriveStatus(soft, m('practising', 'practising'), undefined)).toBe('unlocked');
    expect(deriveStatus(soft, m('practising'), undefined)).toBe('locked');
  });
});

describe('nextGuideLevel (design §3.5)', () => {
  it('fades when accurate and on target', () => {
    expect(nextGuideLevel(3, 0.95, 2000, targets)).toBe(2);
    expect(nextGuideLevel(1, 0.9, 2500, targets)).toBe(0);
  });

  it('does not fade when slow, unknown speed, or already bare', () => {
    expect(nextGuideLevel(3, 0.95, 3000, targets)).toBe(3);
    expect(nextGuideLevel(3, 0.95, null, targets)).toBe(3);
    expect(nextGuideLevel(0, 0.95, 1000, targets)).toBe(0);
  });

  it('restores guides when accuracy collapses', () => {
    expect(nextGuideLevel(0, 0.5, 1000, targets)).toBe(1);
    expect(nextGuideLevel(3, 0.5, 1000, targets)).toBe(3);
  });

  it('holds within the band', () => {
    expect(nextGuideLevel(2, 0.8, 1000, targets)).toBe(2);
  });
});
