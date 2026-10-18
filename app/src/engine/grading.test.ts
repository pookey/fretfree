import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { gradeAnswer, speedTargets } from './grading';

describe('speedTargets', () => {
  it('adds the configured deltas to the calibrated baseline', () => {
    expect(speedTargets(500)).toEqual({ targetMs: 2500, fluentTargetMs: 1500 });
  });

  it('falls back to the default baseline before calibration', () => {
    expect(speedTargets(null)).toEqual({ targetMs: 2700, fluentTargetMs: 1700 });
  });

  it('accepts custom grading config', () => {
    expect(
      speedTargets(100, { targetDeltaMs: 1000, fluentDeltaMs: 500, defaultBaselineMs: 0 }),
    ).toEqual({ targetMs: 1100, fluentTargetMs: 600 });
  });
});

describe('gradeAnswer (design §3.2)', () => {
  const t = { targetMs: 2500, fluentTargetMs: 1500 };

  it('wrong → Again regardless of speed', () => {
    expect(gradeAnswer({ correct: false, responseMs: 100 }, t)).toBe(Rating.Again);
  });

  it('correct but slower than target → Hard', () => {
    expect(gradeAnswer({ correct: true, responseMs: 2501 }, t)).toBe(Rating.Hard);
  });

  it('correct within target → Good (boundaries inclusive)', () => {
    expect(gradeAnswer({ correct: true, responseMs: 2500 }, t)).toBe(Rating.Good);
    expect(gradeAnswer({ correct: true, responseMs: 1501 }, t)).toBe(Rating.Good);
  });

  it('correct at or under the fluent target → Easy', () => {
    expect(gradeAnswer({ correct: true, responseMs: 1500 }, t)).toBe(Rating.Easy);
    expect(gradeAnswer({ correct: true, responseMs: 0 }, t)).toBe(Rating.Easy);
  });

  it('hint use caps the rating at Hard', () => {
    expect(gradeAnswer({ correct: true, responseMs: 100, hintUsed: true }, t)).toBe(Rating.Hard);
    expect(gradeAnswer({ correct: true, responseMs: 9000, hintUsed: true }, t)).toBe(Rating.Hard);
    expect(gradeAnswer({ correct: false, responseMs: 100, hintUsed: true }, t)).toBe(Rating.Again);
  });
});
