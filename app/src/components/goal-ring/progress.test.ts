import { describe, expect, it } from 'vitest';
import {
  RING_CIRCUMFERENCE,
  freezesLabel,
  goalLabel,
  goalProgress,
  ringOffset,
  streakLabel,
} from './progress';

describe('goalProgress', () => {
  it('starts empty', () => {
    expect(goalProgress(0, 10)).toEqual({ minutes: 0, goalMinutes: 10, fraction: 0, met: false });
  });

  it('fills part-way and floors the minutes shown', () => {
    const p = goalProgress(6.7, 10);
    expect(p.minutes).toBe(6);
    expect(p.fraction).toBeCloseTo(0.67);
    expect(p.met).toBe(false);
  });

  it('is met at the goal and clamps a double session to one ring', () => {
    expect(goalProgress(10, 10)).toMatchObject({ fraction: 1, met: true });
    expect(goalProgress(25, 10)).toMatchObject({ minutes: 25, fraction: 1, met: true });
  });

  it('never goes negative or divides by zero', () => {
    expect(goalProgress(-3, 10)).toMatchObject({ minutes: 0, fraction: 0, met: false });
    expect(goalProgress(5, 0)).toMatchObject({ fraction: 0, met: false });
  });
});

describe('labels', () => {
  it('names the ring for VoiceOver', () => {
    expect(goalLabel(goalProgress(6, 10))).toBe('Daily goal: 6 of 10 minutes');
    expect(goalLabel(goalProgress(12, 10))).toBe('Daily goal met: 12 of 10 minutes');
  });

  it('names the streak and freezes', () => {
    expect(streakLabel(0)).toBe('0-day streak');
    expect(streakLabel(7)).toBe('7-day streak');
    expect(freezesLabel(0)).toBe('No streak freezes held');
    expect(freezesLabel(1)).toBe('1 streak freeze held');
    expect(freezesLabel(2)).toBe('2 streak freezes held');
  });
});

describe('ringOffset', () => {
  it('hides the arc at 0 and draws it fully at 1', () => {
    expect(ringOffset(0)).toBeCloseTo(RING_CIRCUMFERENCE);
    expect(ringOffset(0.5)).toBeCloseTo(RING_CIRCUMFERENCE / 2);
    expect(ringOffset(1)).toBe(0);
    expect(ringOffset(2)).toBe(0);
    expect(ringOffset(-1)).toBeCloseTo(RING_CIRCUMFERENCE);
  });
});
