import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../engine/config';
import { STRUM_PATTERNS, TAP_PATTERNS } from '../../engine/items/rhythm-pattern';
import { getTuning } from '../../theory';
import type { DrillContext } from '../types';
import {
  D20_SCOPE,
  d20CanTest,
  d20Check,
  d20ConceptOf,
  d20DescribeAnswer,
  d20DescribeOffset,
  d20Explain,
  d20GradedResponseMs,
  d20MakePrompt,
  d20Marks,
  d20Pulses,
  d20Rating,
  d20Result,
  d20Sounds,
  d20Tempo,
  type D20Answer,
  type D20Prompt,
} from './logic';
import { PATTERNS, strokeAt } from './patterns';

const ctx = (scopeLevel = 0, rng = () => 0): DrillContext => ({
  tuning: getTuning('standard'),
  accidentalPref: 'sharp',
  scopeLevel,
  rng,
});

const prompt = (id: string, scopeLevel = 0) =>
  d20MakePrompt({ id, skillId: 'F4.pulse' }, ctx(scopeLevel));

/** Targets every 500 ms (120 BPM quarters), onsets each `offset` ms off. */
function take(p: D20Prompt, offsets: readonly (number | null)[], extra: number[] = []): D20Answer {
  const targetsMs = p.pulses.map((pulse) => 10_000 + pulse * 500);
  const onsetsMs = targetsMs.flatMap((t, i) => {
    const o = offsets[i % offsets.length];
    return o === null || o === undefined ? [] : [t + o];
  });
  return { input: 'tap', targetsMs, onsetsMs: [...onsetsMs, ...extra] };
}

describe('D20 patterns', () => {
  it('has hits for every tap and strum pattern, ascending, on the eighth grid', () => {
    for (const name of [...TAP_PATTERNS, ...STRUM_PATTERNS]) {
      const { hits } = PATTERNS[name];
      expect(hits.length, name).toBeGreaterThan(0);
      expect(
        [...hits].sort((a, b) => a - b),
        name,
      ).toEqual(hits);
      for (const s of hits) expect(s >= 0 && s < 8 && Number.isInteger(s), name).toBe(true);
    }
  });

  it('strums down on the beat and up on the "&"', () => {
    expect([0, 1, 2, 7].map(strokeAt)).toEqual(['down', 'up', 'down', 'up']);
  });
});

describe('d20MakePrompt', () => {
  it('builds a tap prompt with two bars of hits in pulses', () => {
    const p = prompt('tap-rhythm:offbeats');
    expect(p).toMatchObject({
      itemId: 'tap-rhythm:offbeats',
      kind: 'tap',
      pattern: 'offbeats',
      name: 'Only the “&”s',
      hits: [1, 3, 5, 7],
      countInBars: 1,
      bars: 2,
      offbeats: true,
      bpm: 60,
    });
    expect(p.pulses).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
  });

  it('builds a strum prompt, and knows a rhythm on the beat has no off-beats', () => {
    expect(prompt('strum-rhythm:d-du-udu')).toMatchObject({ kind: 'strum', offbeats: true });
    expect(prompt('strum-rhythm:down-quarters').offbeats).toBe(false);
    expect(prompt('tap-rhythm:quarters').pulses).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects other items', () => {
    expect(() => prompt('note@s6f5')).toThrow(/cannot test/);
  });

  it('takes its tempo from the scope level’s band', () => {
    const bands = ENGINE_CONFIG.rhythm.tempoBands;
    expect(D20_SCOPE).toEqual({ minLevel: 0, maxLevel: bands.length - 1 });
    bands.forEach(([lo, hi], level) => {
      expect(d20Tempo(level, () => 0)).toBe(lo);
      expect(d20Tempo(level, () => 0.999999)).toBe(hi);
      const mid = d20Tempo(level, () => 0.5);
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      expect(mid % ENGINE_CONFIG.rhythm.tempoStep).toBe(0);
    });
    // Out-of-range levels clamp to the ends.
    expect(d20Tempo(-1, () => 0)).toBe(bands[0]![0]);
    expect(d20Tempo(99, () => 0)).toBe(bands.at(-1)![0]);
    expect(prompt('tap-rhythm:quarters', 3).bpm).toBe(bands[3]![0]);
  });

  it('spreads bars by four pulses', () => {
    expect(d20Pulses([0, 3], 3)).toEqual([0, 1.5, 4, 5.5, 8, 9.5]);
  });
});

describe('d20 grading', () => {
  const p = prompt('tap-rhythm:quarters');

  it('rates a tight take Easy, a good one Good, a loose one Hard, and a sloppy one Again', () => {
    expect(d20Rating(p, take(p, [5, -5]), { hintUsed: false })).toBe(Rating.Easy);
    expect(d20Rating(p, take(p, [25, -20]), { hintUsed: false })).toBe(Rating.Good);
    expect(d20Rating(p, take(p, [40, -45]), { hintUsed: false })).toBe(Rating.Hard);
    expect(d20Rating(p, take(p, [80, 5]), { hintUsed: false })).toBe(Rating.Again);
    expect(d20Rating(p, take(p, [null]), { hintUsed: false })).toBe(Rating.Again);
  });

  it('caps a worked example at Hard', () => {
    expect(d20Rating(p, take(p, [0]), { hintUsed: true })).toBe(Rating.Hard);
    expect(d20Rating(p, take(p, [null]), { hintUsed: true })).toBe(Rating.Again);
  });

  it('counts stray hits against the take', () => {
    const steady = take(p, [0]);
    const strays = [10_250, 10_750, 11_250];
    expect(d20Result({ ...steady, onsetsMs: [...steady.onsetsMs, ...strays] })).toMatchObject({
      extras: 3,
      needed: 9,
      rating: Rating.Again,
    });
  });

  it('checks a pass as correct, and says how far a fail fell short', () => {
    expect(d20Check(p, take(p, [10, -10]))).toEqual({ correct: true, expected: '8 of 8 on time' });
    expect(d20Check(p, take(p, [10, 90]))).toEqual({
      correct: false,
      expected: '4 of 8 on time (7 needed)',
    });
    expect(d20Check(p, take(p, [10], [10_250, 10_750, 11_250]))).toEqual({
      correct: false,
      expected: '8 of 8 on time (9 needed, 3 extra hits)',
    });
    expect(d20Check(p, take(p, [10], [10_250])).expected).toBe('8 of 8 on time');
  });

  it('logs the timing error of a rep within the target, or else the time taken', () => {
    expect(d20GradedResponseMs(p, take(p, [10, -20]), 9000)).toBe(15);
    expect(d20GradedResponseMs(p, take(p, [30]), 9000)).toBe(30);
    // A loose (Hard) rep isn't fluent: it logs the time taken.
    expect(d20GradedResponseMs(p, take(p, [40, -45]), 9000)).toBe(9000);
    expect(d20GradedResponseMs(p, take(p, [null]), 9000)).toBe(9000);
  });

  it('describes each hit for the review log', () => {
    expect(d20DescribeAnswer(take(p, [12.4, -5, null, 0]))).toBe(
      'tap: +12 -5 miss 0 +12 -5 miss 0',
    );
    expect(d20DescribeAnswer({ ...take(p, [0], [10_250]), input: 'mic' })).toBe(
      'mic: 0 0 0 0 0 0 0 0, 1 extra hit',
    );
  });

  it('plays nothing back', () => {
    const answer = take(p, [0]);
    expect(d20Sounds(p, { answer, result: d20Check(p, answer) })).toEqual({ expected: [] });
  });
});

describe('d20Marks', () => {
  it('marks each hit of each bar on time, early, late or missed', () => {
    const p = prompt('tap-rhythm:charleston');
    const marks = d20Marks(p, take(p, [3.6, -70, 60, null]));
    expect(marks).toEqual([
      { bar: 0, step: 0, offsetMs: 4, verdict: 'on' },
      { bar: 0, step: 3, offsetMs: -70, verdict: 'early' },
      { bar: 1, step: 0, offsetMs: 60, verdict: 'late' },
      { bar: 1, step: 3, offsetMs: null, verdict: 'miss' },
    ]);
  });
});

describe('d20Explain', () => {
  const explain = (p: D20Prompt, answer: D20Answer) =>
    d20Explain(p, { answer, result: d20Check(p, answer) });

  it('says how tight the take was, and whether it rushed or dragged', () => {
    const p = prompt('tap-rhythm:quarters');
    expect(explain(p, take(p, [10, -10]))).toBe('Typically 10 ms off (aim for 30).');
    expect(explain(p, take(p, [-25, -35]))).toBe(
      'Typically 30 ms off (aim for 30). You’re rushing: 30 ms early on average.',
    );
    expect(explain(p, take(p, [20, 30, 20, null]))).toBe(
      'Typically 20 ms off (aim for 30). You’re dragging: 23 ms late on average. 2 missed.',
    );
  });

  it('says when nothing landed, and counts the extra hits', () => {
    const p = prompt('strum-rhythm:down-quarters');
    expect(explain(p, take(p, [null]))).toMatch(/^No hits landed near the rhythm/);
    expect(explain(p, take(p, [90, -70]))).toBe(
      'Your hits were 80 ms off on average. Within 50 ms counts.',
    );
    expect(explain(p, take(p, [90]))).toBe(
      'Your hits were 90 ms off on average, all late. Within 50 ms counts.',
    );
    expect(explain(p, take(p, [-60, -80]))).toBe(
      'Your hits were 70 ms off on average, all early. Within 50 ms counts.',
    );
    expect(explain(p, take(p, [0], [10_250]))).toBe(
      'Typically 0 ms off (aim for 30). 1 extra hit between the rhythm’s strums.',
    );
    const t = prompt('tap-rhythm:quarters');
    expect(explain(t, take(t, [0], [10_250, 10_750]))).toMatch(
      /2 extra hits between the rhythm’s taps\.$/,
    );
  });
});

describe('d20DescribeOffset', () => {
  it('says late, early, or on the click', () => {
    expect(d20DescribeOffset(12)).toBe('12 ms late');
    expect(d20DescribeOffset(-7.6)).toBe('8 ms early');
    expect(d20DescribeOffset(0.2)).toBe('right on the click');
  });
});

describe('D20 meta', () => {
  it('tests rhythm items only, each its own concept', () => {
    const item = { id: 'tap-rhythm:eighths', skillId: 'F4.eighths' };
    expect(d20CanTest(item)).toBe(true);
    expect(d20ConceptOf(item)).toBe('tap-rhythm:eighths');
    expect(d20CanTest({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBe(false);
    expect(d20ConceptOf({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBeNull();
  });
});
