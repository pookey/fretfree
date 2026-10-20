import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../engine/config';
import { alignOnsets, gradeTiming, summariseTiming, type TimingGradeConfig } from './grade';

const cfg: TimingGradeConfig = {
  onTimeMs: 50,
  passRate: 0.8,
  targetMs: 30,
  fluentMs: 15,
  matchMs: 150,
};

describe('alignOnsets', () => {
  const targets = [1000, 1500, 2000, 2500];

  it('matches each target to its nearest onset, signed', () => {
    expect(alignOnsets(targets, [1010, 1480, 2003, 2540], 150)).toEqual({
      offsets: [10, -20, 3, 40],
      extras: [],
    });
  });

  it('reports misses and stray onsets, and never uses an onset twice', () => {
    const { offsets, extras } = alignOnsets(targets, [1005, 1040, 2490], 150);
    expect(offsets).toEqual([5, null, null, -10]);
    expect(extras).toEqual([1040]);
  });

  it('reaches no further than half the gap to a neighbour', () => {
    // 1240 is nearer 1000's slot than 1500's, but 260ms late is beyond the gap.
    const { offsets } = alignOnsets([1000, 1250], [1124, 1126], 150);
    expect(offsets).toEqual([124, -124]);
  });

  it('ignores onsets outside the span, such as count-in taps', () => {
    expect(alignOnsets(targets, [200, 600, 1000, 3000], 150)).toEqual({
      offsets: [0, null, null, null],
      extras: [],
    });
  });

  it('accepts onsets in any order, and no targets', () => {
    expect(alignOnsets(targets, [2500, 1000]).offsets).toEqual([0, null, null, 0]);
    expect(alignOnsets([], [1, 2])).toEqual({ offsets: [], extras: [] });
  });

  it('uses the configured match window by default', () => {
    expect(ENGINE_CONFIG.timing.grade.matchMs).toBeGreaterThan(ENGINE_CONFIG.timing.grade.onTimeMs);
    expect(alignOnsets([0], [ENGINE_CONFIG.timing.grade.matchMs]).offsets).toEqual([
      ENGINE_CONFIG.timing.grade.matchMs,
    ]);
  });
});

describe('summariseTiming', () => {
  it('counts on-time onsets, misses and bias', () => {
    expect(summariseTiming([10, -20, 30, 70, null], cfg, 1)).toEqual({
      targets: 5,
      onTime: 3,
      misses: 1,
      extras: 1,
      onTimeRate: 0.5,
      medianAbsMs: 20,
      meanOffsetMs: 20 / 3,
    });
  });

  it('takes the middle pair for an even count, and has no median without on-time onsets', () => {
    expect(summariseTiming([10, 20, -30, 40], cfg).medianAbsMs).toBe(25);
    expect(summariseTiming([null, 90], cfg)).toMatchObject({
      medianAbsMs: null,
      meanOffsetMs: null,
    });
  });

  it('needs a target', () => {
    expect(() => summariseTiming([], cfg)).toThrow(RangeError);
  });
});

describe('gradeTiming', () => {
  const steady = (ms: number) => [ms, -ms, ms, -ms, ms, -ms, ms, -ms];

  it('follows the §3.2 shape: tight is Easy, in the target Good, loose Hard', () => {
    expect(gradeTiming(steady(10), cfg)).toBe(Rating.Easy);
    expect(gradeTiming(steady(15), cfg)).toBe(Rating.Easy);
    expect(gradeTiming(steady(25), cfg)).toBe(Rating.Good);
    expect(gradeTiming(steady(30), cfg)).toBe(Rating.Good);
    expect(gradeTiming(steady(45), cfg)).toBe(Rating.Hard);
  });

  it('is Again when too few onsets land on time', () => {
    expect(gradeTiming([0, 0, 0, null], cfg)).toBe(Rating.Again);
    expect(gradeTiming([0, 0, 0, 0, 0, 0, 0, 80], cfg)).toBe(Rating.Easy);
    expect(gradeTiming([0, 0, 0, 80, 80], cfg)).toBe(Rating.Again);
    expect(gradeTiming([null, null], cfg)).toBe(Rating.Again);
  });

  it('counts stray onsets against the on-time share', () => {
    expect(gradeTiming(steady(5), cfg, { extras: 1 })).toBe(Rating.Easy);
    expect(gradeTiming(steady(5), cfg, { extras: 3 })).toBe(Rating.Again);
  });

  it('caps at Hard when a hint was used', () => {
    expect(gradeTiming(steady(5), cfg, { hintUsed: true })).toBe(Rating.Hard);
    expect(gradeTiming(steady(45), cfg, { hintUsed: true })).toBe(Rating.Hard);
    expect(gradeTiming([null], cfg, { hintUsed: true })).toBe(Rating.Again);
  });

  it('lets a drill tighten the target (D20: ±30ms)', () => {
    const d20 = { ...cfg, onTimeMs: 30 };
    expect(gradeTiming(steady(40), cfg)).toBe(Rating.Hard);
    expect(gradeTiming(steady(40), d20)).toBe(Rating.Again);
  });

  it('defaults to the engine config, inside the ±30–50ms band', () => {
    const { onTimeMs, targetMs, fluentMs } = ENGINE_CONFIG.timing.grade;
    expect(onTimeMs).toBeGreaterThanOrEqual(30);
    expect(onTimeMs).toBeLessThanOrEqual(50);
    expect(fluentMs).toBeLessThan(targetMs);
    expect(targetMs).toBeLessThanOrEqual(onTimeMs);
    expect(gradeTiming(steady(1))).toBe(Rating.Easy);
  });
});
