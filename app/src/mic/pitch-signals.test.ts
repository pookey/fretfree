/**
 * The whole detector on synthetic guitar signals: samples → pitchy analysis
 * (the worklet's analyzer) → stable-note tracking with the shipped
 * `MIC_CONFIG` and the detector's own `DETECTOR_TRACKER`. These pin the
 * tracker thresholds against real detector output.
 */
import { describe, expect, it } from 'vitest';
import { MIC_CONFIG } from './config';
import { createNoteTracker, frequencyToMidi, type TrackerEvent } from './tracker';
import type { NoteTrackerOptions, PitchFrame } from './types';
import { createPitchAnalyzer } from './worklet/analyzer';
import { DETECTOR_TRACKER } from './worklet/config';
import { BRIGHT, concat, pluck, whiteNoise } from './worklet/test-signals';

const RATE = 48000;
const A2 = 110;

function detect(signal: Float32Array, tracking: Partial<NoteTrackerOptions> = DETECTOR_TRACKER) {
  const analyzer = createPitchAnalyzer(RATE);
  const tracker = createNoteTracker(tracking);
  const frames: PitchFrame[] = [];
  const events: TrackerEvent[] = [];
  for (let i = 0; i < signal.length; i += 128) {
    for (const m of analyzer.push(signal.subarray(i, i + 128), i / RATE)) {
      const frame = { frequency: m.frequency, clarity: m.clarity, at: m.time * 1000 };
      frames.push(frame);
      events.push(...tracker.push(frame));
    }
  }
  events.push(...tracker.flush());
  return { frames, events };
}

/** Events as short strings: `+A2` when a note becomes stable, `-A2` when it ends. */
function summary(events: readonly TrackerEvent[]): string[] {
  return events.map((e) => (e.type === 'note' ? `+${e.note.name}` : `-${e.end.note.name}`));
}

const silence = (ms: number) => new Float32Array(Math.round((RATE * ms) / 1000));
const near = (frame: PitchFrame, frequency: number) =>
  frame.clarity >= MIC_CONFIG.tracker.minClarity &&
  Math.abs(frequencyToMidi(frame.frequency) - frequencyToMidi(frequency)) < 0.5;

describe('detector + tracker on synthetic guitar signals', () => {
  it('turns one pluck into one stable note, in tune', () => {
    const signal = concat(
      pluck({ frequency: 82.41, sampleRate: RATE, durationMs: 600, attackMs: 8, noise: 0.003 }),
      silence(200),
    );
    const { events } = detect(signal);
    expect(summary(events)).toEqual(['+E2', '-E2']);
    const [first] = events;
    if (first?.type !== 'note') throw new Error('expected a note');
    expect(first.note.stableAt - first.note.startedAt).toBeGreaterThanOrEqual(80);
    // The window and the 80ms hold: stable within ~150ms of the pluck.
    expect(first.note.stableAt).toBeLessThan(150);
    expect(Math.abs(first.note.cents)).toBeLessThan(5);
  });

  // The odd harmonics drop out for `ms` (the pick damping them, say): pitchy
  // hears the octave for a frame or two, well short of 80ms.
  const glitched = (ms: number) =>
    concat(
      pluck({
        frequency: A2,
        sampleRate: RATE,
        durationMs: 700,
        harmonics: BRIGHT,
        gain: (h, at) => (h % 2 === 1 && at >= 300 && at < 300 + ms ? 0 : 1),
      }),
      silence(200),
    );

  it('keeps one note through an octave glitch mid-note', () => {
    const { frames, events } = detect(glitched(50));
    const octave = frames.filter((f) => near(f, 2 * A2));
    expect(octave.length).toBeGreaterThan(0);
    expect(octave.at(-1)!.at - octave[0]!.at).toBeLessThan(MIC_CONFIG.tracker.minStableMs);
    expect(summary(events)).toEqual(['+A2', '-A2']);
  });

  it.each([10, 20, 30, 50])('rides out a %ims blip in a sustained note', (ms) => {
    expect(summary(detect(glitched(ms)).events)).toEqual(['+A2', '-A2']);
  });

  it("would split it with the contract's 50ms dropout (why DETECTOR_TRACKER exists)", () => {
    expect(summary(detect(glitched(20), {}).events)).toEqual(['+A2', '-A2', '+A2', '-A2']);
  });

  it('reports a sustained octave jump during the decay as a new note', () => {
    // From 400ms the fundamental is gone for good: the string now sounds an octave up.
    const signal = concat(
      pluck({
        frequency: A2,
        sampleRate: RATE,
        durationMs: 700,
        gain: (h, ms) => (h % 2 === 1 && ms >= 400 ? 0 : 1),
      }),
      silence(200),
    );
    const { events } = detect(signal);
    expect(summary(events)).toEqual(['+A2', '-A2', '+A3', '-A3']);
    const octave = events[2];
    if (octave?.type !== 'note') throw new Error('expected a note');
    expect(octave.note.stableAt - octave.note.startedAt).toBeGreaterThanOrEqual(80);
  });

  it('holds a note played sharp with wide vibrato (holdCents 65)', () => {
    // +40 cents with ±30 cents of vibrato swings past the quarter-tone line.
    const signal = concat(
      pluck({
        frequency: 196 * 2 ** (40 / 1200),
        sampleRate: RATE,
        durationMs: 1200,
        decayMs: 4000,
        vibratoCents: 30,
        vibratoHz: 5.5,
      }),
      silence(200),
    );
    const { events } = detect(signal);
    expect(summary(events)).toEqual(['+G3', '-G3']);
  });

  it('counts a note re-picked after a short mute twice', () => {
    const note = () => pluck({ frequency: 146.83, sampleRate: RATE, durationMs: 300, attackMs: 5 });
    const { events } = detect(concat(note(), silence(100), note(), silence(200)));
    expect(summary(events)).toEqual(['+D3', '-D3', '+D3', '-D3']);
  });

  it('follows a melody, low to high', () => {
    const notes = [40, 45, 50, 55, 59, 64, 76, 88];
    const signal = concat(
      ...notes.map((midi, i) =>
        concat(
          pluck({
            frequency: 440 * 2 ** ((midi - 69) / 12),
            sampleRate: RATE,
            durationMs: 250,
            attackMs: 5,
            noise: 0.002,
            seed: i,
          }),
          silence(80),
        ),
      ),
    );
    const { events } = detect(signal);
    const heard = events.flatMap((e) => (e.type === 'note' ? [e.note.midi] : []));
    expect(heard).toEqual(notes);
  });

  it('ends a note that fades into the noise floor, with nothing after it', () => {
    const signal = concat(
      pluck({ frequency: 329.63, sampleRate: RATE, durationMs: 2500, decayMs: 300, noise: 0.002 }),
    );
    const { events } = detect(signal);
    expect(summary(events)).toEqual(['+E4', '-E4']);
    const end = events[1];
    if (end?.type !== 'note-end') throw new Error('expected an end');
    expect(end.end.endedAt).toBeLessThan(2000);
  });

  it('hears no notes in room noise', () => {
    for (const rms of [0.001, 0.01, 0.1]) {
      expect(detect(whiteNoise(RATE, 1500, rms, Math.round(rms * 1000))).events).toEqual([]);
    }
  });
});
