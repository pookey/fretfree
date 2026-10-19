import { describe, expect, it } from 'vitest';
import { frequencyToMidi, midiToFrequency } from '../tracker';
import { MIC_CONFIG } from '../config';
import { createPitchAnalyzer } from './analyzer';
import type { PitchMessage } from './protocol';
import { BRIGHT, WEAK_FUNDAMENTAL, pluck, whiteNoise } from './test-signals';

/** Feeds a signal in 128-sample render quanta, as the worklet does. */
function analyse(signal: Float32Array, sampleRate: number, quantum = 128): PitchMessage[] {
  const analyzer = createPitchAnalyzer(sampleRate);
  const frames: PitchMessage[] = [];
  for (let i = 0; i < signal.length; i += quantum) {
    frames.push(...analyzer.push(signal.subarray(i, i + quantum), i / sampleRate));
  }
  return frames;
}

const voiced = (frames: readonly PitchMessage[]) =>
  frames.filter((f) => f.clarity >= MIC_CONFIG.tracker.minClarity);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

// Low B on a 7-string (MIDI 35) to the 24th fret of high E (MIDI 88).
const GUITAR_RANGE = Array.from({ length: 88 - 35 + 1 }, (_, i) => 35 + i);

describe('createPitchAnalyzer', () => {
  it('sizes the window for two periods of low B and hops every 20ms', () => {
    expect(createPitchAnalyzer(44100)).toMatchObject({ windowSize: 2048, hopSize: 882 });
    expect(createPitchAnalyzer(48000)).toMatchObject({ windowSize: 2048, hopSize: 960 });
    expect(createPitchAnalyzer(96000)).toMatchObject({ windowSize: 4096, hopSize: 1920 });
  });

  it('emits a frame per hop once the window fills, timed at the window end', () => {
    const sampleRate = 48000;
    const frames = analyse(pluck({ frequency: 220, sampleRate, durationMs: 200 }), sampleRate);
    // The first frame as soon as 2048 samples are in; then one every 960.
    expect(frames[0]?.time).toBeCloseTo(2048 / sampleRate, 9);
    expect(frames[1]!.time - frames[0]!.time).toBeCloseTo(0.02, 9);
    expect(frames).toHaveLength(8);
  });

  it('gives the same frames whatever the block size', () => {
    const sampleRate = 44100;
    const signal = pluck({ frequency: 147, sampleRate, durationMs: 150, noise: 0.01 });
    const inQuanta = analyse(signal, sampleRate);
    const whole = createPitchAnalyzer(sampleRate).push(signal, 0);
    expect(whole).toHaveLength(inQuanta.length);
    whole.forEach((frame, i) => {
      expect(frame.frequency).toBe(inQuanta[i]?.frequency);
      expect(frame.time).toBeCloseTo(inQuanta[i]!.time, 9);
    });
  });

  it('reports silence and room noise as unvoiced', () => {
    const silent = analyse(new Float32Array(48000), 48000);
    expect(silent.length).toBeGreaterThan(40);
    expect(silent.every((f) => f.frequency === 0 && f.clarity === 0)).toBe(true);

    // Below the volume gate: not even analysed.
    expect(analyse(whiteNoise(48000, 500, 0.001), 48000).every((f) => f.clarity === 0)).toBe(true);
    // Loud noise has no pitch: nothing in it reaches the voicing threshold.
    for (const seed of [1, 2, 3]) {
      const noisy = analyse(whiteNoise(48000, 1000, 0.1, seed), 48000);
      expect(voiced(noisy)).toEqual([]);
    }
  });

  describe.each([
    ['a bright pluck', BRIGHT],
    ['a weak fundamental under a loud 2nd harmonic', WEAK_FUNDAMENTAL],
  ])('across the guitar range, %s', (_, harmonics) => {
    it.each([48000, 44100])('at %i Hz finds every note with no octave errors', (sampleRate) => {
      // Every note at 48 kHz; every fifth one at 44.1 kHz to keep the suite quick.
      const notes = sampleRate === 48000 ? GUITAR_RANGE : GUITAR_RANGE.filter((m) => m % 5 === 0);
      for (const midi of notes) {
        const signal = pluck({
          frequency: midiToFrequency(midi),
          sampleRate,
          durationMs: 360,
          harmonics,
          noise: 0.005,
          attackMs: 5,
          seed: midi,
        });
        const frames = voiced(analyse(signal, sampleRate));
        expect(frames.length, `MIDI ${midi}`).toBeGreaterThanOrEqual(12);
        const heard = frames.map((f) => frequencyToMidi(f.frequency));
        expect(
          heard.filter((m) => Math.round(m) !== midi),
          `MIDI ${midi}`,
        ).toEqual([]);
        // A real string is slightly sharp (inharmonicity); still within a few cents.
        expect(Math.abs(median(heard.map((m) => (m - midi) * 100))), `MIDI ${midi}`).toBeLessThan(
          3,
        );
      }
    });
  });

  it('measures a detuned note to the cent', () => {
    for (const cents of [-35, -12, 0, 18, 42]) {
      const frequency = midiToFrequency(52 + cents / 100);
      const signal = pluck({ frequency, sampleRate: 48000, durationMs: 300, inharmonicity: 0 });
      const heard = voiced(analyse(signal, 48000)).map((f) => frequencyToMidi(f.frequency));
      expect(median(heard.map((m) => (m - 52) * 100))).toBeCloseTo(cents, 0);
    }
  });

  // minClarity 0.9: voiced down to ~10 dB SNR (white noise, the worst case),
  // and the noisier frames that can be the wrong note never reach it.
  it.each([
    [82.41, BRIGHT],
    [196, WEAK_FUNDAMENTAL],
    [659.3, BRIGHT],
  ])('stays voiced over noise, and never wrong, at %f Hz', (frequency, harmonics) => {
    const base = { frequency, sampleRate: 48000, durationMs: 400, decayMs: 0, harmonics };
    const clean = pluck(base);
    const rms = Math.sqrt(clean.reduce((sum, v) => sum + v * v, 0) / clean.length);
    for (const snr of [20, 10, 6, 3]) {
      const frames = analyse(pluck({ ...base, noise: rms / 10 ** (snr / 20) }), 48000);
      const heard = voiced(frames).map((f) => Math.round(frequencyToMidi(f.frequency)));
      expect(new Set(heard), `${snr} dB`).toEqual(
        new Set(heard.length ? [Math.round(frequencyToMidi(frequency))] : []),
      );
      if (snr >= 10) expect(heard.length / frames.length, `${snr} dB`).toBeGreaterThan(0.8);
    }
  });
});
