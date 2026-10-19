import { describe, expect, it } from 'vitest';
import { AUDIO } from './config';
import { beatSeconds, planProgression, STRUM_PATTERNS } from './progression';

const G = { notes: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'] };
const C = { notes: ['C3', 'E3', 'G3', 'C4', 'E4'] };
const D = { notes: ['D3', 'A3', 'D4', 'F#4'] };

describe('planProgression', () => {
  it('strums each chord once by default, held for the configured beats', () => {
    const plan = planProgression([G, C, D]);
    const per = AUDIO.progression.beatsPerChord;
    expect(plan.events).toEqual([
      { beat: 0, chord: 0, direction: 'down', length: per },
      { beat: per, chord: 1, direction: 'down', length: per },
      { beat: 2 * per, chord: 2, direction: 'down', length: per },
    ]);
    expect(plan.chordStarts).toEqual([0, per, 2 * per]);
    expect(plan.totalBeats).toBe(3 * per);
  });

  it('repeats a pattern across each chord', () => {
    const plan = planProgression([G, C], { pattern: 'quarters', beatsPerChord: 2 });
    expect(plan.events.map((e) => [e.beat, e.chord])).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    expect(plan.events.every((e) => e.length === 1)).toBe(true);
  });

  it('lays out down-up eighths', () => {
    const plan = planProgression([G], { pattern: 'eighths', beatsPerChord: 2 });
    expect(plan.events.map((e) => `${e.beat}${e.direction[0]}`)).toEqual([
      '0d',
      '0.5u',
      '1d',
      '1.5u',
    ]);
    expect(plan.events.map((e) => e.length)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('plays the folk pattern over a bar, and cuts it short on a shorter chord', () => {
    const plan = planProgression([G, { ...D, beats: 2 }], { pattern: 'folk' });
    expect(plan.events.map((e) => `${e.beat}${e.direction[0]}`)).toEqual([
      '0d',
      '1d',
      '1.5u',
      '2.5u',
      '3d',
      '3.5u',
      '4d',
      '5d',
      '5.5u',
    ]);
    expect(plan.events.at(-1)?.length).toBe(0.5);
    expect(plan.totalBeats).toBe(6);
  });

  it('takes a custom pattern, ignoring strokes past its cycle', () => {
    const plan = planProgression([G], {
      beatsPerChord: 3,
      pattern: {
        strokes: [
          { beat: 0, direction: 'down' },
          { beat: 2, direction: 'up' },
          { beat: 3.5, direction: 'up' },
        ],
        cycle: 3,
      },
    });
    expect(plan.events.map((e) => e.beat)).toEqual([0, 2]);
    expect(plan.events.map((e) => e.length)).toEqual([2, 1]);
  });

  it('lets time pass on a rest without sounding anything', () => {
    const plan = planProgression([G, { notes: [], beats: 2 }, C]);
    expect(plan.events.map((e) => e.chord)).toEqual([0, 2]);
    // The chord before a rest rings through it.
    expect(plan.events[0]?.length).toBe(6);
    expect(plan.chordStarts).toEqual([0, 4, 6]);
    expect(plan.totalBeats).toBe(10);
  });

  it('is empty for no chords', () => {
    expect(planProgression([])).toEqual({ events: [], chordStarts: [], totalBeats: 0 });
  });

  it('rejects lengths that are not positive', () => {
    expect(() => planProgression([G], { beatsPerChord: 0 })).toThrow(RangeError);
    expect(() => planProgression([{ ...G, beats: -1 }])).toThrow(RangeError);
    expect(() => planProgression([G], { beatsPerChord: Number.NaN })).toThrow(RangeError);
    expect(() =>
      planProgression([G], { pattern: { ...STRUM_PATTERNS.quarters, cycle: 0 } }),
    ).toThrow(RangeError);
  });

  it('rejects a stroke before the start of its cycle', () => {
    const early = { strokes: [{ beat: -0.5, direction: 'up' as const }], cycle: 1 };
    expect(() => planProgression([G], { pattern: early })).toThrow(RangeError);
    const nan = { strokes: [{ beat: Number.NaN, direction: 'up' as const }], cycle: 1 };
    expect(() => planProgression([G], { pattern: nan })).toThrow(RangeError);
  });
});

describe('beatSeconds', () => {
  it('converts a tempo to seconds per beat', () => {
    expect(beatSeconds(60)).toBe(1);
    expect(beatSeconds(120)).toBe(0.5);
    expect(() => beatSeconds(0)).toThrow(RangeError);
  });
});
