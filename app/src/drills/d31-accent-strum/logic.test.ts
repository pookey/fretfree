import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import {
  ACCENT_PATTERNS,
  COUNT_PATTERNS,
  accentItemId,
  countItemId,
} from '../../engine/items/accent';
import { getTuning } from '../../theory';
import {
  D31_ID,
  D31_SCOPE,
  d31Bar,
  d31CanTest,
  d31Check,
  d31ClickLine,
  d31ConceptOf,
  d31DescribeAnswer,
  d31DescribeOffset,
  d31Explain,
  d31GradedResponseMs,
  d31HeardAccents,
  d31MakePrompt,
  d31Marks,
  d31Rating,
  d31Result,
  d31RightRate,
  d31Score,
  d31Sounds,
  d31StartRung,
  d31Tempo,
  type D31Answer,
  type D31Prompt,
} from './logic';

const CFG = ENGINE_CONFIG.accentStrum;
const SOFT = CFG.accents.softTapStrength;

const ctx = (scopeLevel = 0, rng = () => 0) => ({
  tuning: getTuning('standard'),
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng,
});

const prompt = (id: string, scopeLevel = 0) =>
  d31MakePrompt({ id, skillId: 'T5.downbeat' }, ctx(scopeLevel));

/** Every stroke at 100 ms a pulse from 10 s, played `offset` ms off, strong where asked. */
function take(
  p: D31Prompt,
  offset: number | null = 0,
  strength: (accented: boolean, i: number) => number = (a) => (a ? 1 : SOFT),
  input: 'tap' | 'mic' = 'tap',
): D31Answer {
  const targetsMs = p.pulses.map((pulse) => 10_000 + pulse * 500);
  return {
    input,
    targetsMs,
    onsets:
      offset === null
        ? []
        : targetsMs.map((t, i) => ({ at: t + offset, strength: strength(p.accented[i]!, i) })),
    window: 'standard',
    rungs: [0, 0, 1, 2],
  };
}

const feedback = (p: D31Prompt, a: D31Answer) => ({ answer: a, result: d31Check(p, a) });

describe('D31 items and bars', () => {
  it('tests count and accent items, keyed by their meter', () => {
    expect(D31_ID).toBe('accent-strum');
    expect(D31_SCOPE).toEqual({ minLevel: 0, maxLevel: CFG.tempoBands.length - 1 });
    expect(d31CanTest({ id: 'count:6/8:3', skillId: 'T3.compound' })).toBe(true);
    expect(d31CanTest({ id: 'tap-rhythm:quarters', skillId: 'F4.pulse' })).toBe(false);
    expect(d31ConceptOf({ id: 'count:4/4:3', skillId: 'T3.simple' })).toBe('meter:4/4');
    expect(d31ConceptOf({ id: 'accent:12/8:backbeat', skillId: 'T5.backbeat' })).toBe('meter:12/8');
    expect(d31ConceptOf({ id: 'meter:4/4:feltBeats', skillId: 'T1.simple-meters' })).toBeNull();
    expect(() => d31Bar({ id: 'nope', skillId: 'x' })).toThrow();
  });

  it('counts sixteenths, triplets and compound eighths with the beats accented', () => {
    const six = d31Bar({ id: 'count:2/4:4', skillId: 'T3.simple' });
    expect(six).toMatchObject({ meter: '2/4', stepsPerPulse: 4, steps: 8, accents: [0, 4] });
    expect(six.syllables).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a']);
    expect(six.hits).toHaveLength(8);
    const trip = d31Bar({ id: 'count:4/4:3', skillId: 'T3.simple' });
    expect(trip.syllables.slice(0, 6)).toEqual(['1', 'trip', 'let', '2', 'trip', 'let']);
    expect(trip).toMatchObject({ stepsPerPulse: 3, steps: 12, accents: [0, 3, 6, 9] });
    const comp = d31Bar({ id: 'count:6/8:3', skillId: 'T3.compound' });
    expect(comp.syllables).toEqual(['1', 'la', 'li', '2', 'la', 'li']);
    expect(comp).toMatchObject({ stepsPerPulse: 1, accents: [0, 3], beatStarts: [0, 3] });
    expect(comp.click).toEqual({ groups: [3, 3], unit: 8 });
    expect(d31Bar({ id: 'count:9/8:3', skillId: 'T3.compound' }).name).toBe('9/8 in eighths');
  });

  it('writes out each accent pattern on its meter’s grid', () => {
    const back = d31Bar({ id: 'accent:4/4:backbeat', skillId: 'T5.backbeat' });
    expect(back).toMatchObject({ hits: [0, 1, 2, 3], accents: [1, 3], strokes: null });
    expect(back.click).toEqual({ groups: [4], unit: 4 });
    const rock = d31Bar({ id: 'accent:4/4:rock-strum', skillId: 'T5.strumming' });
    expect(rock.syllables).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(rock.hits.map((s) => rock.strokes![s])).toEqual([
      'down',
      'down',
      'up',
      'up',
      'down',
      'up',
    ]);
    const six = d31Bar({ id: 'accent:6/8:strum', skillId: 'T5.strumming' });
    expect(six.hits.map((s) => six.strokes![s])).toEqual(['down', 'up', 'down', 'up']);
    const seven = d31Bar({ id: 'accent:7/8:grouping', skillId: 'T5.odd' });
    expect(seven.syllables).toEqual(['1', '&', '2', '&', '3', 'la', 'li']);
    expect(seven.click).toEqual({ groups: [2, 2, 3], unit: 8 });
    expect(seven.beatStarts).toEqual([0, 2, 4]);
    expect(d31Bar({ id: 'accent:5/4:grouping', skillId: 'T5.odd' }).click.groups).toEqual([3, 2]);
  });

  it('accents only strokes it plays, and never gives the count away in a hint', () => {
    const ids = [...COUNT_PATTERNS.map(countItemId), ...ACCENT_PATTERNS.map(accentItemId)];
    for (const id of ids) {
      const bar = d31Bar({ id, skillId: 'x' });
      expect(bar.accents.length, id).toBeGreaterThan(0);
      expect(bar.accents.length, id).toBeLessThan(bar.hits.length);
      for (const a of bar.accents) expect(bar.hits, id).toContain(a);
      expect(bar.syllables, id).toHaveLength(bar.steps);
      expect(bar.hint, id).not.toMatch(/“1|\b(la li|e & a|trip let)\b/);
    }
  });
});

describe('d31MakePrompt', () => {
  it('lays four bars of strokes on the click’s pulses, accented per bar', () => {
    const p = prompt('accent:4/4:backbeat');
    expect(p).toMatchObject({
      kind: 'accent',
      meter: '4/4',
      bars: CFG.bars,
      bpm: 60,
      strum: false,
    });
    expect(p.pulses.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(p.pulses).toHaveLength(16);
    expect(p.accented.slice(0, 4)).toEqual([false, true, false, true]);
    expect(p.ladder[0]).toEqual({ keep: 'all' });
    expect(p.ladder.at(-1)).toEqual({ keep: 'none' });
    const strum = prompt('accent:3/4:waltz-strum');
    expect(strum.strum).toBe(true);
    expect(strum.pulses.slice(0, 5)).toEqual([0, 1, 1.5, 2, 2.5]);
  });

  it('picks a tempo from the scope’s band, eighth meters at twice, capped for fast strokes', () => {
    const back = d31Bar({ id: 'accent:4/4:backbeat', skillId: 'x' });
    expect(d31Tempo(back, 0, () => 0)).toBe(60);
    expect(d31Tempo(back, 3, () => 0.999)).toBe(120);
    expect(d31Tempo(back, 9, () => 0)).toBe(104);
    expect(d31Tempo(back, -1, () => 0.5)).toBe(66);
    const six8 = d31Bar({ id: 'count:6/8:3', skillId: 'x' });
    expect(d31Tempo(six8, 0, () => 0)).toBe(120);
    // Sixteenths: 4 strokes a beat, no more than 250 a minute.
    const sixteenths = d31Bar({ id: 'count:4/4:4', skillId: 'x' });
    expect(d31Tempo(sixteenths, 3, () => 0)).toBe(62);
    expect(d31Tempo(sixteenths, 3, () => 0) * 4).toBeLessThanOrEqual(CFG.maxStrokesPerMinute);
  });

  it('starts the click higher up its ladder as the guides fade', () => {
    expect(d31StartRung(3, 5)).toBe(0);
    expect(d31StartRung(2, 5)).toBe(1);
    expect(d31StartRung(0, 5)).toBe(3);
    expect(d31StartRung(0, 3)).toBe(2);
  });
});

describe('d31HeardAccents', () => {
  it('reads a tap’s pad, and a strum against the take’s others', () => {
    expect(d31HeardAccents('tap', [1, SOFT, 0.8])).toEqual([true, false, true]);
    expect(d31HeardAccents('mic', [])).toEqual([]);
    expect(d31HeardAccents('mic', [0.9, 0.3, 0.32, 0.28])).toEqual([true, false, false, false]);
    // All alike: nothing stands out, so nothing is accented.
    expect(d31HeardAccents('mic', [0.5, 0.55, 0.5])).toEqual([false, false, false]);
    expect(d31HeardAccents('mic', [0, 0.4])).toEqual([false, true]);
  });
});

describe('D31 grading', () => {
  it('passes a take in time with the right accents, and rates it by its timing', () => {
    const p = prompt('accent:4/4:backbeat');
    const a = take(p, 8);
    expect(d31Check(p, a)).toEqual({ correct: true, expected: '16 of 16 right' });
    expect(d31Rating(p, a, { hintUsed: false })).toBe(Rating.Easy);
    expect(d31Rating(p, a, { hintUsed: true })).toBe(Rating.Hard);
    expect(d31Rating(p, take(p, 35), { hintUsed: false })).toBe(Rating.Good);
    expect(d31GradedResponseMs(p, a, 20_000)).toBe(8);
    expect(d31GradedResponseMs(p, take(p, 60), 20_000)).toBe(20_000);
    expect(d31Sounds(p, feedback(p, a))).toEqual({ expected: [] });
  });

  it('counts a stroke with the wrong accent as a miss', () => {
    const p = prompt('accent:4/4:backbeat');
    // Every stroke strong: the eight soft ones are wrong.
    const loud = take(p, 0, () => 1);
    expect(d31Check(p, loud)).toEqual({
      correct: false,
      expected: '8 of 16 right (13 needed; 8 accents off)',
    });
    expect(d31Rating(p, loud, { hintUsed: false })).toBe(Rating.Again);
    const r = d31Result(p, loud);
    expect(r.verdicts.slice(0, 4)).toEqual(['loud', 'on', 'loud', 'on']);
    expect(r.accentErrors).toBe(8);
    // One accent soft in four bars still passes.
    const one = take(p, 0, (acc, i) => (acc && i !== 1 ? 1 : SOFT));
    expect(d31Check(p, one)).toEqual({ correct: true, expected: '15 of 16 right' });
    expect(d31Marks(p, one)[1]).toMatchObject({ bar: 0, step: 1, accented: true, verdict: 'soft' });
  });

  it('judges strums from the mic by how loud each is against the rest', () => {
    const p = prompt('accent:4/4:rock-strum');
    const right = take(p, 5, (acc) => (acc ? 0.8 : 0.3), 'mic');
    expect(d31Check(p, right).correct).toBe(true);
    const flat = take(p, 5, () => 0.4, 'mic');
    expect(d31Check(p, flat)).toMatchObject({ correct: false });
    expect(d31Result(p, flat).verdicts.filter((v) => v === 'soft')).toHaveLength(8);
  });

  it('marks early, late and missed strokes, and counts stray ones', () => {
    const p = prompt('accent:4/4:downbeat');
    const a = take(p, 0);
    a.onsets[0] = { at: a.targetsMs[0]! - 100, strength: 1 };
    a.onsets[1] = { at: a.targetsMs[1]! + 100, strength: SOFT };
    a.onsets.splice(2, 1);
    const r = d31Result(p, a);
    expect(r.verdicts.slice(0, 3)).toEqual(['early', 'late', 'miss']);
    expect(d31Check(p, a)).toEqual({ correct: true, expected: '13 of 16 right' });
    // A stray strum between two strokes counts against the share.
    a.onsets.push({ at: a.targetsMs[5]! + 250, strength: SOFT });
    expect(d31Result(p, a).extras).toBe(1);
    expect(d31Check(p, a)).toEqual({
      correct: false,
      expected: '13 of 16 right (14 needed; 1 extra stroke)',
    });
  });

  it('rates the share of a bar played right, strays counted, for the fade', () => {
    const scored = d31Score(
      'tap',
      'standard',
      [0, 500, 1000, 1500],
      [true, false, false, false],
      [
        { at: 0, strength: 1 },
        { at: 500, strength: 1 },
        { at: 1000, strength: SOFT },
        { at: 1500, strength: SOFT },
        { at: 1250, strength: SOFT },
      ],
    );
    expect(scored.verdicts).toEqual(['on', 'loud', 'on', 'on']);
    expect(scored.extras).toBe(1);
    expect(d31RightRate(scored)).toBe(3 / 5);
    expect(d31RightRate(d31Score('tap', 'standard', [], [], []))).toBe(0);
  });

  it('logs each stroke as played, with the click it had', () => {
    const p = prompt('accent:2/4:downbeat');
    const a = take(p, 12);
    a.onsets.splice(1, 1);
    expect(d31DescribeAnswer(a)).toBe(
      'tap: +12!, miss, +12!, +12, +12!, +12, +12!, +12; click rungs 0 0 1 2',
    );
    a.onsets[0] = { ...a.onsets[0]!, at: a.targetsMs[0]! - 4 };
    expect(d31DescribeAnswer(a).startsWith('tap: -4!, miss')).toBe(true);
  });
});

describe('D31 text', () => {
  it('names what the click keeps at each rung', () => {
    const p = prompt('accent:4/4:downbeat');
    expect(p.ladder.map((_, i) => d31ClickLine(p, i))).toEqual([
      'Click: every beat',
      'Click: beat 1',
      'Click: beat 1 of every 2nd bar',
      'Click: beat 1 of every 4th bar',
      'No click: keep the pulse yourself',
    ]);
    const six = prompt('count:6/8:3');
    expect(six.ladder.map((_, i) => d31ClickLine(six, i)).slice(0, 3)).toEqual([
      'Click: every beat',
      'Click: the start of each beat group',
      'Click: beat 1',
    ]);
    const sixteenths = prompt('count:4/4:4');
    expect(d31ClickLine(sixteenths, 0)).toBe('Click: every step');
    expect(d31ClickLine(sixteenths, 1)).toBe('Click: every beat');
    expect(d31ClickLine(sixteenths, 99)).toBe('No click: keep the pulse yourself');
  });

  it('explains the timing, the accents and how far the click faded', () => {
    const p = prompt('accent:4/4:backbeat');
    expect(d31Explain(p, feedback(p, take(p, 8)))).toBe(
      'Typically 8 ms off (aim for 45). The click faded to beat 1 of every 2nd bar.',
    );
    expect(d31Explain(p, feedback(p, take(p, -40)))).toBe(
      'Typically 40 ms off (aim for 45). You’re rushing: 40 ms early on average. The click faded to beat 1 of every 2nd bar.',
    );
    const loud = take(p, 30, () => 1);
    loud.rungs = [0, 0, 0, 0];
    expect(d31Explain(p, feedback(p, loud))).toBe(
      'Typically 30 ms off (aim for 45). You’re dragging: 30 ms late on average. 8 soft strokes played strong.',
    );
    const late = take(p, 120);
    late.rungs = [0, 1, 4, 4];
    expect(d31Explain(p, feedback(p, late))).toBe(
      'Your strokes were 120 ms off on average. Within 80 ms counts. The click dropped out altogether.',
    );
    const none = take(p, null);
    none.rungs = [0, 0, 0, 0];
    expect(d31Explain(p, feedback(p, none))).toMatch(/^No strokes landed/);
    const flat = take(prompt('accent:4/4:rock-strum'), 0, () => 0.4, 'mic');
    flat.rungs = [0, 0, 0, 0];
    expect(
      d31Explain(prompt('accent:4/4:rock-strum'), feedback(prompt('accent:4/4:rock-strum'), flat)),
    ).toBe(
      'Typically 0 ms off (aim for 45). 8 accents played soft. Strum the accents clearly harder than the rest.',
    );
  });

  it('describes an offset', () => {
    expect(d31DescribeOffset(0.2)).toBe('right on the click');
    expect(d31DescribeOffset(12.4)).toBe('12 ms late');
    expect(d31DescribeOffset(-7)).toBe('7 ms early');
  });
});
