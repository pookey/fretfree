import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from './config';
import { EMPTY_STREAK, SessionGuides, isFluent, stepGuideLevel, type GuideStreak } from './guides';
import type { GuideLevel } from './model';

const targets = { targetMs: 2700, fluentTargetMs: 1700 };
const cfg = { maxLevel: 3, fadeAfterFluent: 3, restoreAfterErrors: 2 };
const fluent = { correct: true, responseMs: 1200 };
const slow = { correct: true, responseMs: 4000 };
const wrong = { correct: false, responseMs: 1200 };
const hinted = { correct: true, responseMs: 900, hintUsed: true };

function run(
  level: GuideLevel,
  outcomes: (typeof fluent)[],
): { level: GuideLevel; streak: GuideStreak } {
  let step = { level, streak: EMPTY_STREAK };
  for (const o of outcomes) step = stepGuideLevel(step.level, step.streak, o, targets, cfg);
  return step;
}

describe('isFluent', () => {
  it('is correct and at or under the speed target', () => {
    expect(isFluent({ correct: true, responseMs: 2700 }, targets)).toBe(true);
    expect(isFluent({ correct: true, responseMs: 2701 }, targets)).toBe(false);
    expect(isFluent({ correct: false, responseMs: 500 }, targets)).toBe(false);
  });
});

describe('stepGuideLevel', () => {
  it('fades one level after N consecutive fluent answers, then starts a fresh streak', () => {
    expect(run(3, [fluent, fluent]).level).toBe(3);
    expect(run(3, [fluent, fluent, fluent])).toEqual({ level: 2, streak: EMPTY_STREAK });
    expect(run(3, Array(6).fill(fluent)).level).toBe(1);
    expect(run(3, Array(9).fill(fluent)).level).toBe(0);
  });

  it('never fades below 0', () => {
    expect(run(0, Array(9).fill(fluent)).level).toBe(0);
  });

  it('a slow correct answer breaks the fluent streak', () => {
    expect(run(3, [fluent, fluent, slow, fluent, fluent]).level).toBe(3);
  });

  it('restores one level after consecutive errors', () => {
    expect(run(1, [wrong]).level).toBe(1);
    expect(run(1, [wrong, wrong])).toEqual({ level: 2, streak: EMPTY_STREAK });
    expect(run(0, [wrong, wrong, wrong, wrong]).level).toBe(2);
  });

  it('never restores above the maximum level', () => {
    expect(run(3, [wrong, wrong, wrong, wrong]).level).toBe(3);
  });

  it('any correct answer breaks the error run, and an error breaks the fluent run', () => {
    expect(run(1, [wrong, slow, wrong]).level).toBe(1);
    expect(run(1, [wrong, fluent, wrong]).level).toBe(1);
    expect(run(3, [fluent, fluent, wrong, fluent, fluent]).level).toBe(3);
  });

  it('ignores worked examples (hinted reps)', () => {
    const streak = { fluent: 2, errors: 0 };
    expect(stepGuideLevel(3, streak, hinted, targets, cfg)).toEqual({ level: 3, streak });
    expect(run(3, [fluent, fluent, hinted, fluent]).level).toBe(2);
  });

  it('uses ENGINE_CONFIG by default', () => {
    let step = { level: 3 as GuideLevel, streak: EMPTY_STREAK };
    for (let i = 0; i < ENGINE_CONFIG.guides.fadeAfterFluent; i++) {
      step = stepGuideLevel(step.level, step.streak, fluent, targets);
    }
    expect(step.level).toBe(2);
  });
});

describe('SessionGuides', () => {
  it('keeps one streak per skill', () => {
    const g = new SessionGuides(targets, cfg);
    let a: GuideLevel = 3;
    let b: GuideLevel = 3;
    a = g.record('a', a, fluent);
    b = g.record('b', b, fluent);
    a = g.record('a', a, fluent);
    b = g.record('b', b, wrong);
    a = g.record('a', a, fluent);
    b = g.record('b', b, fluent);
    expect(a).toBe(2);
    expect(b).toBe(3);
  });

  it('remembers the level each skill started the session at', () => {
    const g = new SessionGuides(targets, cfg);
    let level: GuideLevel = 2;
    for (let i = 0; i < 3; i++) level = g.record('a', level, fluent);
    expect(level).toBe(1);
    expect(g.startLevel('a', level)).toBe(2);
    expect(g.startLevel('unseen', 3)).toBe(3);
  });

  it('defaults to ENGINE_CONFIG', () => {
    const g = new SessionGuides(targets);
    let level: GuideLevel = 1;
    for (let i = 0; i < ENGINE_CONFIG.guides.restoreAfterErrors; i++) {
      level = g.record('a', level, wrong);
    }
    expect(level).toBe(2);
  });
});
