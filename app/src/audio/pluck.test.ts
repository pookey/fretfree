import { describe, expect, it } from 'vitest';
import { midiToHz, renderPluck, type PluckSpec } from './pluck';

/** A tiny seeded PRNG (mulberry32), so renders are repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATE = 48_000;
const spec = (over: Partial<PluckSpec> = {}): PluckSpec => ({
  frequency: 220,
  sampleRate: RATE,
  seconds: 2,
  t60: 1.5,
  brightness: 0.5,
  peak: 0.5,
  rng: seeded(1),
  ...over,
});

/** The fundamental, from the strongest autocorrelation lag (parabolic-refined). */
function pitchOf(x: Float32Array, from: number, size: number, sampleRate: number): number {
  const frame = x.subarray(from, from + size);
  const minLag = Math.floor(sampleRate / 1500);
  const maxLag = Math.floor(sampleRate / 60);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < frame.length; i++) s += frame[i]! * frame[i + lag]!;
    return s / (frame.length - lag);
  };
  let best = minLag;
  let bestValue = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = ac(lag);
    if (v > bestValue) [best, bestValue] = [lag, v];
  }
  const [a, b, c] = [ac(best - 1), ac(best), ac(best + 1)];
  const shift = (0.5 * (a - c)) / (a - 2 * b + c);
  return sampleRate / (best + shift);
}

const rms = (x: Float32Array, from: number, size: number) =>
  Math.sqrt(x.subarray(from, from + size).reduce((s, v) => s + v * v, 0) / size);

describe('renderPluck', () => {
  it('renders the requested length, peaking at the requested level', () => {
    const out = renderPluck(spec());
    expect(out).toHaveLength(2 * RATE);
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(0.5, 5);
  });

  it.each([
    ['E2', 40],
    ['A2', 45],
    ['G3', 55],
    ['A4', 69],
    ['E5', 76],
    ['B5', 83],
  ])('sounds %s in tune (within 5 cents)', (_, midi) => {
    const hz = midiToHz(midi);
    const out = renderPluck(spec({ frequency: hz }));
    const found = pitchOf(out, RATE / 10, 4096, RATE);
    expect(Math.abs(1200 * Math.log2(found / hz))).toBeLessThan(5);
  });

  it('stays in tune at 44.1 kHz too', () => {
    const out = renderPluck(spec({ sampleRate: 44_100, frequency: 196 }));
    expect(Math.abs(1200 * Math.log2(pitchOf(out, 4410, 4096, 44_100) / 196))).toBeLessThan(5);
  });

  it('dies away: about 60 dB down by t60, and longer t60 rings longer', () => {
    const out = renderPluck(spec({ t60: 1 }));
    const early = rms(out, 0, 2048);
    const late = rms(out, RATE, 2048);
    expect(20 * Math.log10(late / early)).toBeLessThan(-40);
    const long = renderPluck(spec({ t60: 3 }));
    expect(rms(long, RATE, 2048)).toBeGreaterThan(late * 10);
  });

  it('is darker with less brightness', () => {
    // Energy in the sample-to-sample difference tracks the high harmonics.
    const highs = (x: Float32Array) => {
      let s = 0;
      for (let i = 1; i < 4096; i++) s += (x[i]! - x[i - 1]!) ** 2;
      return s / rms(x, 0, 4096) ** 2;
    };
    const dark = renderPluck(spec({ brightness: 0.15, rng: seeded(3) }));
    const bright = renderPluck(spec({ brightness: 1, rng: seeded(3) }));
    expect(highs(dark)).toBeLessThan(highs(bright));
  });

  it('has no DC offset and fades to silence at the end', () => {
    const out = renderPluck(spec());
    const mean = out.subarray(0, 4800).reduce((s, v) => s + v, 0) / 4800;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(out[out.length - 1]!)).toBe(0);
  });

  it('is repeatable for the same seed and varies with the seed', () => {
    expect(renderPluck(spec({ rng: seeded(7) }))).toEqual(renderPluck(spec({ rng: seeded(7) })));
    expect(renderPluck(spec({ rng: seeded(7) }))).not.toEqual(
      renderPluck(spec({ rng: seeded(8) })),
    );
  });

  it('renders silence rather than NaN from a burst with no energy', () => {
    const out = renderPluck(spec({ rng: () => 0.5, seconds: 0.1 }));
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('rejects specs it cannot render', () => {
    expect(() => renderPluck(spec({ frequency: 0 }))).toThrow(RangeError);
    expect(() => renderPluck(spec({ frequency: RATE / 4 }))).toThrow(RangeError);
    expect(() => renderPluck(spec({ sampleRate: 0 }))).toThrow(RangeError);
    expect(() => renderPluck(spec({ seconds: 0 }))).toThrow(RangeError);
    expect(() => renderPluck(spec({ t60: -1 }))).toThrow(RangeError);
    expect(() => renderPluck(spec({ brightness: 0 }))).toThrow(RangeError);
    expect(() => renderPluck(spec({ peak: 2 }))).toThrow(RangeError);
  });
});

describe('midiToHz', () => {
  it('maps A4 to 440 Hz and an octave to a doubling', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
    expect(midiToHz(40)).toBeCloseTo(82.41, 2);
  });
});
