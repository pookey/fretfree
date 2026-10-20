import { describe, expect, it } from 'vitest';
import { METRONOME_CONFIG } from './config';
import {
  accentFor,
  accentStyles,
  addTap,
  beatCells,
  clampBpm,
  clickMeter,
  inTools,
  tapTempo,
} from './logic';

/** Taps every `ms`, `n` times, from `start`. */
const steady = (n: number, ms: number, start = 1000) =>
  Array.from({ length: n }, (_, i) => start + i * ms);

/** Feeds taps one at a time, as the button does. */
const tapAll = (times: readonly number[]) => times.reduce<number[]>((t, at) => addTap(t, at), []);

describe('clampBpm', () => {
  it('rounds to a whole BPM within 30–250', () => {
    expect(clampBpm(120.4)).toBe(120);
    expect(clampBpm(120.5)).toBe(121);
    expect(clampBpm(10)).toBe(30);
    expect(clampBpm(400)).toBe(250);
  });

  it('falls back to the default for nonsense', () => {
    expect(clampBpm(Number.NaN)).toBe(METRONOME_CONFIG.defaultBpm);
    expect(clampBpm(Infinity)).toBe(METRONOME_CONFIG.defaultBpm);
  });
});

describe('tap tempo', () => {
  it('needs two taps', () => {
    expect(tapTempo([])).toBeNull();
    expect(tapTempo(tapAll([1000]))).toBeNull();
  });

  it('reads the tempo from the interval', () => {
    expect(tapTempo(tapAll(steady(2, 500)))).toBe(120);
    expect(tapTempo(tapAll(steady(4, 600)))).toBe(100);
    expect(tapTempo(tapAll(steady(5, 1000)))).toBe(60);
  });

  it('rounds to a whole BPM', () => {
    // 60000 / 444 = 135.1
    expect(tapTempo(tapAll(steady(4, 444)))).toBe(135);
  });

  it('takes the median interval, so one stray tap does not move it', () => {
    const taps = tapAll([0, 500, 1000, 1350, 2000, 2500].map((t) => t + 1000));
    // Intervals 500, 500, 350, 650, 500: the median is 500.
    expect(tapTempo(taps)).toBe(120);
  });

  it('averages the middle pair of an even count', () => {
    // Intervals 500 and 600: median 550 → 109.1
    expect(tapTempo(tapAll([1000, 1500, 2100]))).toBe(109);
  });

  it('can tap the slowest tempo, 30 BPM', () => {
    expect(tapTempo(tapAll(steady(3, 2000)))).toBe(30);
  });

  it('holds the result to 30–250', () => {
    expect(tapTempo(tapAll(steady(4, 100)))).toBe(250);
  });

  it('starts a new count after a long pause', () => {
    const taps = tapAll([...steady(4, 500), 1000 + 3 * 500 + 2600]);
    expect(taps).toHaveLength(1);
    expect(tapTempo(taps)).toBeNull();
    expect(tapTempo(addTap(taps, taps[0]! + 1000))).toBe(60);
  });

  it('starts a new count when a tap is not later than the last', () => {
    expect(tapAll([1000, 1500, 1500])).toEqual([1500]);
    expect(tapAll([1000, 1500, 1200])).toEqual([1200]);
  });

  it('keeps only the latest taps, so a new tempo takes over', () => {
    const { maxTaps } = METRONOME_CONFIG.tapTempo;
    const slow = steady(maxTaps, 1000);
    const fast = steady(maxTaps, 500, slow.at(-1)! + 500);
    const taps = tapAll([...slow, ...fast]);
    expect(taps).toHaveLength(maxTaps);
    expect(tapTempo(taps)).toBe(120);
  });

  it('takes its limits from the config passed in', () => {
    expect(addTap([1000], 1400, { resetMs: 300, maxTaps: 8 })).toEqual([1400]);
    expect(addTap([1000, 1100], 1200, { resetMs: 300, maxTaps: 2 })).toEqual([1100, 1200]);
  });
});

describe('accents', () => {
  it('offers felt beats only where a meter has more than one', () => {
    expect(accentStyles('4/4')).toEqual(['downbeat', 'every']);
    expect(accentStyles('7/8 (2+2+3)')).toEqual(['beats', 'downbeat', 'every']);
    expect(accentFor('4/4', 'beats')).toBe('downbeat');
    expect(accentFor('4/4', 'every')).toBe('every');
    expect(accentFor('6/8', 'beats')).toBe('beats');
  });

  it('builds the click meter for a preset and style', () => {
    expect(clickMeter('7/8 (2+2+3)', 'beats')).toEqual({ groups: [2, 2, 3], unit: 8 });
    expect(clickMeter('7/8 (2+2+3)', 'downbeat')).toEqual({ groups: [7], unit: 8 });
    expect(clickMeter('3/4', 'every')).toEqual({ groups: [1, 1, 1], unit: 4 });
    expect(clickMeter('4/4', 'beats')).toEqual({ groups: [4], unit: 4 });
  });

  it('lays out the beat light by felt beat', () => {
    expect(beatCells('5/8 (3+2)', 'beats')).toEqual([
      { pulse: 0, accent: 'bar', groupStart: true },
      { pulse: 1, accent: 'pulse', groupStart: false },
      { pulse: 2, accent: 'pulse', groupStart: false },
      { pulse: 3, accent: 'group', groupStart: true },
      { pulse: 4, accent: 'pulse', groupStart: false },
    ]);
    expect(beatCells('6/8', 'downbeat').map((c) => c.groupStart)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(beatCells('3/4', 'every').map((c) => c.accent)).toEqual(['bar', 'group', 'group']);
  });
});

describe('inTools', () => {
  it('is the Tools index and every tool', () => {
    expect(inTools('/tools')).toBe(true);
    expect(inTools('/tools/')).toBe(true);
    expect(inTools('/tools/metronome')).toBe(true);
    expect(inTools('/')).toBe(false);
    expect(inTools('/toolshed')).toBe(false);
    expect(inTools('/learn/tools')).toBe(false);
  });

  it('allows for a base path', () => {
    expect(inTools('/app/tools/tuner', '/app/')).toBe(true);
    expect(inTools('/tools/tuner', '/app/')).toBe(false);
  });
});
