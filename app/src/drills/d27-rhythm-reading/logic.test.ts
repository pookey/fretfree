import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../engine/config';
import type { Item, TimingWindow } from '../../engine/model';
import { RHYTHM_CELLS, checkBar, formatRhythm, onsets, rhythmCell } from '../../theory';
import type { DrillContext } from '../types';
import {
  buildBar,
  d27CanTest,
  d27Check,
  d27ConceptOf,
  d27Confusion,
  d27DescribeAnswer,
  d27Difference,
  d27Events,
  d27Explain,
  d27GradedResponseMs,
  d27HearPlan,
  d27Level,
  d27MakePrompt,
  d27MarkX,
  d27Marks,
  d27Rating,
  d27Result,
  d27Sounds,
  d27Syllables,
  d27Tempo,
  d27DescribeOffset,
  gridOf,
  partnerOf,
  pulsesPerBar,
  runPulses,
  signatureOf,
  type D27Answer,
  type D27Prompt,
} from './logic';

const CFG = ENGINE_CONFIG.rhythmReading;

/** A seeded generator (mulberry32), so a sweep sees many bars and stays repeatable. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const item = (slug: string): Item => ({ id: `rhythm:${slug}`, skillId: 'R4.test' });

function ctx(scopeLevel: number, rng: () => number = () => 0): DrillContext {
  return { scopeLevel, rng } as DrillContext;
}

function prompt(slug: string, scopeLevel = 0, rng: () => number = () => 0): D27Prompt {
  return d27MakePrompt(item(slug), ctx(scopeLevel, rng));
}

const msPerPulse = (p: D27Prompt) => 60_000 / p.bpm;

/** The prompt's notes from 10 s, each played `offset` ms off (or at `at`'s times instead). */
function take(
  p: D27Prompt,
  offset: number | null,
  { window = 'strict', at = p.pulses }: { window?: TimingWindow; at?: readonly number[] } = {},
): D27Answer {
  const time = (pulse: number) => 10_000 + pulse * msPerPulse(p);
  return {
    input: 'tap',
    targetsMs: p.pulses.map(time),
    partnerTargetsMs: (p.partnerPulses ?? []).map(time),
    onsetsMs: offset === null ? [] : at.map((pulse) => time(pulse) + offset),
    window,
  };
}

describe('D27 items', () => {
  it('tests rhythm cells, keyed by the cell', () => {
    expect(d27CanTest(item('dotted-8th-16th'))).toBe(true);
    expect(d27CanTest({ id: 'tap-rhythm:eighths', skillId: 'F4.eighths' })).toBe(false);
    expect(d27ConceptOf(item('siciliano'))).toBe('rhythm:siciliano');
    expect(d27ConceptOf({ id: 'meter:6/8:feltBeats', skillId: 'T2' })).toBeNull();
    expect(() => d27MakePrompt({ id: 'meter:6/8:feltBeats', skillId: 'T2' }, ctx(0))).toThrow(
      'D27 cannot test',
    );
  });

  it('pairs a cell with its confusable when it is the same length and taught no later', () => {
    expect(partnerOf(rhythmCell('dotted-8th-16th'))?.slug).toBe('two-8ths');
    expect(partnerOf(rhythmCell('dotted-quarter-8th'))?.slug).toBe('two-quarters');
    expect(partnerOf(rhythmCell('siciliano'))?.slug).toBe('three-8ths');
    // Two eighths come before the dotted pair: their bars never write a dot.
    expect(partnerOf(rhythmCell('two-8ths'))).toBeNull();
    // A triplet in 4/4 and three eighths in 6/8 never share a bar.
    expect(partnerOf(rhythmCell('three-8ths'))).toBeNull();
    expect(partnerOf(rhythmCell('quarter'))).toBeNull();
  });

  it('finds the click grid a bar sits on', () => {
    expect(gridOf([0, 1, 2])).toBe(1);
    expect(gridOf([0, 0.5, 1.75])).toBe(4);
    expect(gridOf([0, 1 / 3, 2 / 3])).toBe(3);
    expect(gridOf([0, 1 / 3, 0.5])).toBeNull();
    expect(gridOf([])).toBe(1);
  });
});

describe('D27 bars', () => {
  it('writes every cell at every level as a correct bar that holds it', () => {
    for (const cell of RHYTHM_CELLS) {
      for (let level = 0; level < CFG.levels.length; level += 1) {
        for (let seed = 1; seed <= 25; seed += 1) {
          const p = prompt(cell.slug, level, seeded(seed * 31 + level));
          const label = `${cell.slug} level ${level} seed ${seed}: ${p.bar}`;
          const ts = signatureOf(p.meter);
          const events = d27Events(p);
          expect(checkBar(events, ts).ok, label).toBe(true);
          expect((CFG.meters[cell.feel] as readonly string[]).includes(p.meter), label).toBe(true);
          // The cell is in the bar, whole, where cellEvents says.
          expect(p.cellEvents.length % cell.rhythm.length, label).toBe(0);
          expect(p.cellEvents.length, label).toBeGreaterThan(0);
          for (let i = 0; i < p.cellEvents.length; i += cell.rhythm.length) {
            const run = p.cellEvents.slice(i, i + cell.rhythm.length).map((e) => events[e]!);
            expect(formatRhythm(run), label).toBe(formatRhythm(cell.rhythm));
          }
          // Enough notes to grade, on a click grid the metronome can play.
          const notes = onsets(events).length;
          expect(notes, label).toBeGreaterThanOrEqual(2);
          expect(p.pulses, label).toHaveLength(notes * p.bars);
          expect(gridOf(p.pulses), label).toBe(p.subdivide);
          // A tempo the taps can keep apart.
          expect(p.bpm % CFG.tempoStep, label).toBe(0);
          const gaps = p.pulses.slice(1).map((x, i) => x - p.pulses[i]!);
          expect((p.bpm / Math.min(...gaps)) * 1, label).toBeLessThanOrEqual(CFG.maxNotesPerMinute);
        }
      }
    }
  });

  it('blocks a cell at level 0: over and over in 4/4 or 6/8, a rest taking turns with a quarter', () => {
    expect(prompt('dotted-8th-16th', 0)).toMatchObject({
      style: 'blocked',
      meter: '4/4',
      bar: '8. 16 8. 16 8. 16 8. 16',
      cellEvents: [0, 1, 2, 3, 4, 5, 6, 7],
      subdivide: 4,
    });
    expect(prompt('quarter-rest', 0)).toMatchObject({ bar: '4 r4 4 r4', cellEvents: [1, 3] });
    expect(prompt('three-8ths', 0)).toMatchObject({ meter: '6/8', bar: '8 8 8 8 8 8' });
    expect(prompt('half', 0)).toMatchObject({ bar: '2 2', subdivide: 1 });
  });

  it('writes the dotted cell beside its straight partner at level 1 (contrast)', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const p = prompt('dotted-8th-16th', 1, seeded(seed));
      expect(p.style).toBe('contrast');
      expect(p.partner).toBe('two-8ths');
      expect(p.bar.startsWith('8. 16 8 8')).toBe(true);
    }
    const long = prompt('dotted-quarter-8th', 1);
    expect(long).toMatchObject({ meter: '4/4', bar: '4. 8 4 4', style: 'contrast' });
    const six = prompt('siciliano', 1, () => 0);
    expect(six.bar.startsWith('8. 16 8 8 8 8')).toBe(true);
  });

  it('mixes the cell, its partner and plain cells from level 2', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      const p = prompt('dotted-8th-16th', 2, seeded(seed));
      expect(p.style).toBe('mixed');
      seen.add(p.bar);
      seen.add(p.meter);
    }
    // Varied bars and meters (rule 12).
    expect(seen.size).toBeGreaterThan(6);
    expect(seen.has('3/4') || seen.has('2/4')).toBe(true);
  });

  it('keeps triplets off a straight eighths’ bar, but still spots a rep played straight', () => {
    const p = prompt('8th-triplet', 1, seeded(3));
    expect(p.style).toBe('mixed');
    expect(p.bar).not.toMatch(/(^|\s)8 8(\s|$)/);
    expect(p.subdivide).toBe(3);
    expect(p.partner).toBe('two-8ths');
    expect(p.partnerPulses).not.toBeNull();
  });

  it('falls back to a blocked bar when a mixed bar would hide a beat', () => {
    const cell = rhythmCell('8th-quarter-8th');
    for (let seed = 1; seed <= 40; seed += 1) {
      const b = buildBar(cell, 'mixed', seeded(seed));
      expect(checkBar(b.events, signatureOf(b.meter)).ok).toBe(true);
    }
    const always = () => 0.999;
    expect(buildBar(cell, 'blocked', always)).toMatchObject({ style: 'blocked', meter: '4/4' });
  });

  it('plays the partner’s pulses in place of each tested cell', () => {
    const p = prompt('dotted-8th-16th', 0);
    expect(p.pulses.slice(0, 4)).toEqual([0, 0.75, 1, 1.75]);
    expect(p.partnerPulses!.slice(0, 4)).toEqual([0, 0.5, 1, 1.5]);
    expect(p.pulses).toHaveLength(16);
    expect(p.pulses[8]).toBe(4);
    expect(prompt('quarter', 0).partnerPulses).toBeNull();
  });

  it('counts runs and bars in pulses', () => {
    expect(pulsesPerBar(signatureOf('6/8'))).toBe(6);
    expect(pulsesPerBar(signatureOf('3/4'))).toBe(3);
    expect(runPulses(d27Events({ bar: '4. 4.' }), signatureOf('6/8'), 2)).toEqual([0, 3, 6, 9]);
  });
});

describe('D27 tempo and scope', () => {
  it('clamps the level', () => {
    expect(d27Level(-3)).toBe(CFG.levels[0]);
    expect(d27Level(99)).toBe(CFG.levels.at(-1));
    expect(d27Level(1.2).bar).toBe('contrast');
  });

  it('takes the felt-beat tempo from the band, times the pulses in a beat', () => {
    const quarters = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(d27Tempo(signatureOf('4/4'), quarters, 0, () => 0)).toBe(60);
    expect(d27Tempo(signatureOf('4/4'), quarters, 0, () => 0.999)).toBe(72);
    expect(d27Tempo(signatureOf('4/4'), quarters, 3, () => 0)).toBe(88);
    // 6/8: dotted quarters at 60 are eighths at 180.
    expect(d27Tempo(signatureOf('6/8'), [0, 3, 6, 9], 0, () => 0)).toBe(180);
  });

  it('slows dense bars so notes come no faster than the limit', () => {
    const sixteenths = Array.from({ length: 16 }, (_, i) => i / 4);
    expect(d27Tempo(signatureOf('4/4'), sixteenths, 3, () => 0.999)).toBe(62);
    const triplets = Array.from({ length: 6 }, (_, i) => i / 3);
    expect(d27Tempo(signatureOf('2/4'), triplets, 3, () => 0.999)).toBe(82);
  });
});

describe('D27 grading', () => {
  const p = prompt('dotted-8th-16th', 1, seeded(2));

  it('grades in time as a pass, rated by the timing window', () => {
    const a = take(p, 10);
    expect(d27Check(p, a)).toEqual({
      correct: true,
      expected: `${p.pulses.length} of ${p.pulses.length} on time`,
      concept: 'rhythm:dotted-8th-16th',
    });
    expect(d27Rating(p, a, { hintUsed: false })).toBe(Rating.Easy);
    expect(d27Rating(p, a, { hintUsed: true })).toBe(Rating.Hard);
    expect(d27Rating(p, take(p, 40), { hintUsed: false })).toBe(Rating.Hard);
    // Fluent: the typical error, not the time the rep took.
    expect(d27GradedResponseMs(p, a, 9000)).toBe(10);
    expect(d27GradedResponseMs(p, take(p, 40), 9000)).toBe(9000);
  });

  it('fails a late rep, with what a pass needed, and widens with the window', () => {
    const late = take(p, 90);
    const check = d27Check(p, late);
    expect(check.correct).toBe(false);
    const needed = Math.ceil(CFG.grade.passRate * p.pulses.length);
    expect(check.expected).toBe(`0 of ${p.pulses.length} on time (${needed} needed)`);
    expect(check.confusedWith).toBeUndefined();
    expect(d27Check(p, take(p, 90, { window: 'relaxed' })).correct).toBe(true);
  });

  it('logs a dotted bar tapped straight as the straight cell', () => {
    const straight = take(p, 5, { at: p.partnerPulses! });
    expect(d27Confusion(p, straight)).toBe('two-8ths');
    expect(d27Check(p, straight)).toMatchObject({
      correct: false,
      concept: 'rhythm:dotted-8th-16th',
      confusedWith: 'rhythm:two-8ths',
    });
    const why = d27Explain(p, { answer: straight, result: d27Check(p, straight) });
    expect(why).toContain('played as two eighths, not dotted eighth and sixteenth');
    expect(why).toContain('Read the dot');
    // In time as written: no confusion. Nothing played: none either.
    expect(d27Confusion(p, take(p, 5))).toBeNull();
    expect(d27Confusion(p, take(p, null))).toBeNull();
    // A cell without a partner can't be confused with one.
    const q = prompt('quarter', 2, seeded(4));
    expect(d27Confusion(q, take(q, 90))).toBeNull();
  });

  it('logs a rest tapped through as the cell without it', () => {
    const off = prompt('offbeat-8th', 1, seeded(1));
    const through = take(off, 0, { at: off.partnerPulses! });
    expect(d27Check(off, through).confusedWith).toBe('rhythm:two-8ths');
    expect(d27Explain(off, { answer: through, result: d27Check(off, through) })).toContain(
      'Read the rest',
    );
  });

  it('describes each note for the review log', () => {
    const q = prompt('quarter', 0);
    const a = take(q, 12);
    a.onsetsMs[1] = a.onsetsMs[1]! - 20;
    a.onsetsMs.splice(2, 1);
    a.onsetsMs.push(a.targetsMs[3]! + 500);
    expect(d27DescribeAnswer(a)).toBe('tap: +12 -8 miss +12 +12 +12 +12 +12, 1 extra tap');
    expect(d27DescribeAnswer(take(q, 0))).toMatch(/^tap: 0 0 /);
    expect(d27Sounds(q, { answer: a, result: d27Check(q, a) })).toEqual({ expected: [] });
  });
});

describe('D27 feedback', () => {
  const q = prompt('dotted-8th-16th', 0);

  it('marks every note of every time through with its count', () => {
    const a = take(q, 10);
    a.onsetsMs[1] = a.targetsMs[1]! + 70;
    a.onsetsMs[2] = a.targetsMs[2]! - 70;
    a.onsetsMs.splice(3, 1);
    const marks = d27Marks(q, a);
    expect(marks).toHaveLength(16);
    expect(marks.slice(0, 4)).toEqual([
      { pass: 0, event: 0, syllable: '1', offsetMs: 10, verdict: 'on' },
      { pass: 0, event: 1, syllable: 'a', offsetMs: 70, verdict: 'late' },
      { pass: 0, event: 2, syllable: '2', offsetMs: -70, verdict: 'early' },
      { pass: 0, event: 3, syllable: 'a', offsetMs: null, verdict: 'miss' },
    ]);
    expect(marks[8]).toMatchObject({ pass: 1, event: 0, syllable: '1' });
    expect(d27Syllables(q)).toEqual(['1', 'a', '2', 'a', '3', 'a', '4', 'a']);
  });

  it('places a tap in its box on a square-root scale, clamped at the match window', () => {
    expect(d27MarkX(0)).toBe(0);
    expect(d27MarkX(CFG.grade.matchMs / 4)).toBeCloseTo(0.5);
    expect(d27MarkX(-CFG.grade.matchMs * 3)).toBe(-1);
    expect(d27DescribeOffset(0.3)).toBe('right on time');
    expect(d27DescribeOffset(12.4)).toBe('12 ms late');
    expect(d27DescribeOffset(-30)).toBe('30 ms early');
  });

  it('explains how tight, and which way, a rep leaned', () => {
    const explain = (a: D27Answer) => d27Explain(q, { answer: a, result: d27Check(q, a) });
    expect(explain(take(q, null))).toContain('No taps landed near the notes');
    expect(explain(take(q, 70))).toBe('Your taps were 70 ms off on average. Within 50 ms counts.');
    expect(explain(take(q, -25))).toBe(
      'Typically 25 ms off (aim for 30). You’re rushing: 25 ms early on average.',
    );
    expect(explain(take(q, 25))).toContain('You’re dragging: 25 ms late on average.');
    const missed = take(q, 5);
    missed.onsetsMs.splice(0, 1);
    missed.onsetsMs.push(missed.targetsMs[0]! + msPerPulse(q) * 0.375);
    expect(explain(missed)).toBe(
      'Typically 5 ms off (aim for 30). 1 missed. 1 extra tap between the notes.',
    );
  });

  it('names what tells a cell from its partner', () => {
    expect(d27Difference('dotted-8th-16th', 'two-8ths')).toContain('Read the dot');
    expect(d27Difference('two-8ths', 'dotted-8th-16th')).toContain('no dot');
    expect(d27Difference('offbeat-8th', 'two-8ths')).toContain('Read the rest');
    expect(d27Difference('8th-triplet', 'two-8ths')).toContain('three even notes');
    expect(d27Difference('two-8ths', '8th-triplet')).toContain('No triplet');
    expect(d27Difference('8th-two-16ths', 'two-16ths-8th')).toContain('which note is short');
  });

  it('plays a click on each note of the bar to hear it first', () => {
    expect(d27HearPlan(q)).toEqual({ steps: [0, 3, 4, 7, 8, 11, 12, 15], endPulse: 4 });
    const six = prompt('three-8ths', 0);
    expect(d27HearPlan(six)).toEqual({ steps: [0, 1, 2, 3, 4, 5], endPulse: 6 });
  });

  it('reads a result for any answer', () => {
    const r = d27Result(take(q, 10));
    expect(r.summary.onTime).toBe(16);
    expect(r.needed).toBe(13);
  });
});
