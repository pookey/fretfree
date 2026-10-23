/**
 * Pure sample lookup (M4-15): which recorded note plays a pitch, and how far
 * to shift it. Every note of the neck has its own sample; pitches beyond the
 * shipped range shift the nearest end.
 */
import { AUDIO } from './config';

export interface SampleChoice {
  /** MIDI number of the sample to play. */
  midi: number;
  /** Playback rate that shifts it to the wanted pitch: 1 inside the range. */
  rate: number;
}

export function sampleFor(midi: number): SampleChoice {
  const { low, high } = AUDIO.samples;
  const sample = Math.min(high, Math.max(low, Math.round(midi)));
  return { midi: sample, rate: Math.pow(2, (midi - sample) / 12) };
}

/** Every sample shipped, low to high. */
export function sampleNotes(): number[] {
  const { low, high } = AUDIO.samples;
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}

/** Where a sample is served, under the app's base URL. */
export function sampleUrl(midi: number, base = '/'): string {
  return `${base}${AUDIO.samples.path}${midi}.mp3`;
}

/** Gain for a note played at `velocity` (0–1). */
export function velocityGain(velocity: number): number {
  const { floor } = AUDIO.dynamics;
  const v = Math.min(1, Math.max(0, velocity));
  return floor + (1 - floor) * v;
}
