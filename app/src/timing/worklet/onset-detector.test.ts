import { describe, expect, it } from 'vitest';
import { pluck, whiteNoise, BRIGHT } from '../../mic/worklet/test-signals';
import { createOnsetDetector } from './onset-detector';
import type { OnsetMessage } from './protocol';

interface Placed {
  atMs: number;
  signal: Float32Array;
}

/**
 * Mixes signals into a buffer over background noise. Each ends with a short
 * fade, as a damped string does: a hard cut is a click of its own.
 */
function mix(sampleRate: number, durationMs: number, parts: readonly Placed[], noise = 0.001) {
  const out = whiteNoise(sampleRate, durationMs, noise, 7);
  const fade = Math.round(sampleRate * 0.03);
  for (const { atMs, signal } of parts) {
    const start = Math.round((sampleRate * atMs) / 1000);
    for (let i = 0; i < signal.length && start + i < out.length; i += 1) {
      out[start + i]! += signal[i]! * Math.min(1, (signal.length - i) / fade);
    }
  }
  return out;
}

/** Feeds a signal in 128-sample render quanta, as the worklet does; onset times in ms. */
function detect(signal: Float32Array, sampleRate: number, startTime = 0): number[] {
  const detector = createOnsetDetector(sampleRate);
  const found: OnsetMessage[] = [];
  for (let i = 0; i < signal.length; i += 128) {
    found.push(...detector.push(signal.subarray(i, i + 128), startTime + i / sampleRate));
  }
  return found.map((o) => o.time * 1000);
}

/** Plucks at `times`, each `durationMs` long. */
function plucks(
  sampleRate: number,
  times: readonly number[],
  opts: { frequency?: number; durationMs?: number; amplitude?: number; attackMs?: number } = {},
): Placed[] {
  return times.map((atMs, i) => ({
    atMs,
    signal: pluck({
      frequency: opts.frequency ?? 196,
      sampleRate,
      durationMs: opts.durationMs ?? 450,
      amplitude: opts.amplitude ?? 0.3,
      attackMs: opts.attackMs ?? 3,
      harmonics: BRIGHT,
      seed: i + 1,
    }),
  }));
}

function expectOnsets(found: readonly number[], expected: readonly number[], toleranceMs = 5) {
  expect(found, `found ${found.map((t) => t.toFixed(1)).join(', ')}`).toHaveLength(expected.length);
  found.forEach((t, i) => expect(Math.abs(t - expected[i]!)).toBeLessThanOrEqual(toleranceMs));
}

describe('createOnsetDetector', () => {
  const times = [200, 700, 1200];

  it.each([82.41, 196, 659.3])('finds each pluck at %f Hz within 5ms', (frequency) => {
    for (const sampleRate of [48000, 44100]) {
      const signal = mix(sampleRate, 1800, plucks(sampleRate, times, { frequency }));
      expectOnsets(detect(signal, sampleRate), times);
    }
  });

  it('finds soft and loud strokes alike, down to about −40 dBFS', () => {
    for (const amplitude of [0.8, 0.1, 0.01]) {
      const signal = mix(48000, 1800, plucks(48000, times, { amplitude }));
      expectOnsets(detect(signal, 48000), times);
    }
  });

  it('counts a strum across six strings as one onset', () => {
    const strings = [82.41, 110, 146.8, 196, 246.9, 329.6];
    const strum = strings.map((frequency, i) => ({
      atMs: 300 + i * 8,
      signal: pluck({ frequency, sampleRate: 48000, durationMs: 600, amplitude: 0.2, attackMs: 2, seed: i }),
    }));
    expectOnsets(detect(mix(48000, 1200, strum), 48000), [300]);
  });

  it('finds the same note re-attacked with no gap (M5-02 review)', () => {
    for (const noise of [0.001, 0.005]) {
      const again = [100, 400, 700];
      const signal = mix(48000, 1100, plucks(48000, again, { frequency: 220, durationMs: 300 }), noise);
      expectOnsets(detect(signal, 48000), again);
    }
  });

  it('keeps up with sixteenth notes at 120 BPM, even without a pick noise', () => {
    const sixteenths = Array.from({ length: 8 }, (_, i) => 100 + i * 125);
    for (const attackMs of [0, 3]) {
      const parts = plucks(48000, sixteenths, { frequency: 330, durationMs: 125, attackMs, amplitude: 0.2 });
      expectOnsets(detect(mix(48000, 1300, parts, 0.005), 48000), sixteenths);
    }
  });

  it('hears nothing in silence, steady noise or a ringing note with vibrato', () => {
    expect(detect(new Float32Array(48000), 48000)).toEqual([]);
    for (const rms of [0.005, 0.05, 0.2]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        expect(detect(whiteNoise(48000, 2000, rms, seed), 48000), `${rms} #${seed}`).toEqual([]);
      }
    }
    const ringing = pluck({
      frequency: 196,
      sampleRate: 48000,
      durationMs: 1400,
      decayMs: 0,
      vibratoCents: 30,
      amplitude: 0.3,
    });
    // Only its start: the vibrato that follows is not a new note.
    expectOnsets(detect(mix(48000, 1500, [{ atMs: 100, signal: ringing }]), 48000), [100]);
  });

  it('reports times on the clock it is fed, whatever the block size', () => {
    const signal = mix(48000, 1800, plucks(48000, times));
    const start = 12.5;
    expectOnsets(
      detect(signal, 48000, start),
      times.map((t) => t + start * 1000),
    );
    const whole = createOnsetDetector(48000)
      .push(signal, 0)
      .map((o) => o.time * 1000);
    const quanta = detect(signal, 48000);
    expect(whole).toHaveLength(quanta.length);
    whole.forEach((t, i) => expect(t).toBeCloseTo(quanta[i]!, 6));
  });

  it('takes overrides, such as a longer refractory period', () => {
    const close = [200, 280];
    const signal = mix(48000, 800, plucks(48000, close, { durationMs: 300 }));
    expectOnsets(detect(signal, 48000), close);
    const slow = createOnsetDetector(48000, { refractoryMs: 100 });
    expect(slow.push(signal, 0)).toHaveLength(1);
  });
});
