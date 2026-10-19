import { MIC_CONFIG } from '../../../mic/config';
import { frequencyToMidi, midiToFrequency } from '../../../mic/tracker';
import type { NoteTrackerOptions, PitchFrame } from '../../../mic/types';
import {
  STANDARD_TUNING,
  allStrings,
  midiToFretNote,
  openStringMidi,
  type AccidentalPref,
  type Tuning,
} from '../../../theory';
import { TUNER_CONFIG } from './config';

/**
 * The tuner's pure maths (design §7 Tools): cents, the nearest open string
 * and a steady reading from raw detector frames. Clock-free: times are the
 * frames' own `at`, on the pitch source's clock.
 */

export interface TunerString {
  /** 1 (high E) to 6 (low E). */
  readonly string: number;
  /** Scientific pitch name, e.g. `A2`. */
  readonly name: string;
  /** Pitch class, e.g. `A`. */
  readonly pc: string;
  readonly midi: number;
  readonly frequency: number;
}

/** The open strings, lowest first: E A D G B E, the way a tuning is written. */
export function tunerStrings(
  tuning: Tuning = STANDARD_TUNING,
  pref: AccidentalPref = 'sharp',
  a4: number = MIC_CONFIG.a4,
): TunerString[] {
  return allStrings(tuning)
    .reverse()
    .map((string) => {
      const midi = openStringMidi(string, tuning);
      const { name, pc } = midiToFretNote(midi, pref);
      return { string, name, pc, midi, frequency: midiToFrequency(midi, a4) };
    });
}

/** Signed cents from `to` up to `from`: positive is sharp. */
export function centsBetween(from: number, to: number): number {
  return 1200 * Math.log2(from / to);
}

/** The open string closest in pitch to `frequency`, and how far off it is in cents. */
export function nearestString(
  frequency: number,
  strings: readonly TunerString[],
): { string: TunerString; cents: number } {
  let best: { string: TunerString; cents: number } | null = null;
  for (const string of strings) {
    const cents = centsBetween(frequency, string.frequency);
    if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { string, cents };
  }
  if (!best) throw new Error('No strings to tune');
  return best;
}

/** Which way to turn the peg: flat means tune up. */
export type Advice = 'in-tune' | 'tune-up' | 'tune-down';

export function advise(cents: number, inTuneCents: number = TUNER_CONFIG.inTuneCents): Advice {
  if (Math.abs(cents) <= inTuneCents) return 'in-tune';
  return cents < 0 ? 'tune-up' : 'tune-down';
}

export interface TunerReading {
  readonly frequency: number;
  /** The nearest equal-tempered note. */
  readonly midi: number;
  /** Scientific pitch name, e.g. `G#2`. */
  readonly name: string;
  readonly pc: string;
  readonly octave: number;
  /** Cents from `midi`, −50 to +50: the needle. */
  readonly cents: number;
  /** The note against its own pitch: what the needle shows. */
  readonly advice: Advice;
  /** The nearest open string in the tuning. */
  readonly string: TunerString;
  /** Cents from that string's open pitch: how far to turn its peg. */
  readonly stringCents: number;
  /** Which way to turn that string's peg. */
  readonly stringAdvice: Advice;
}

export function readPitch(
  frequency: number,
  strings: readonly TunerString[],
  {
    pref = 'sharp',
    a4 = MIC_CONFIG.a4,
    inTuneCents = TUNER_CONFIG.inTuneCents,
  }: { pref?: AccidentalPref; a4?: number; inTuneCents?: number } = {},
): TunerReading {
  const exact = frequencyToMidi(frequency, a4);
  const midi = Math.round(exact);
  const cents = (exact - midi) * 100;
  const { name, pc } = midiToFretNote(midi, pref);
  const nearest = nearestString(frequency, strings);
  return {
    frequency,
    midi,
    name,
    pc,
    octave: Math.floor(midi / 12) - 1,
    cents,
    advice: advise(cents, inTuneCents),
    string: nearest.string,
    stringCents: nearest.cents,
    stringAdvice: advise(nearest.cents, inTuneCents),
  };
}

/** Whether a raw frame is a note worth drawing; the analyzer sends {0, 0} for silence. */
export function isVoiced(
  frame: PitchFrame,
  {
    minClarity,
    minFrequency,
    maxFrequency,
  }: Pick<NoteTrackerOptions, 'minClarity' | 'minFrequency' | 'maxFrequency'> = MIC_CONFIG.tracker,
): boolean {
  return (
    frame.clarity >= minClarity &&
    frame.frequency >= minFrequency &&
    frame.frequency <= maxFrequency
  );
}

/** The needle's rotation in degrees for an offset in cents, pinned at ±50. */
export function needleAngle(cents: number, maxDeg: number = TUNER_CONFIG.needleMaxDeg): number {
  const pinned = Math.max(-50, Math.min(50, cents));
  return (pinned / 50) * maxDeg;
}

export interface SmootherOptions {
  smoothingMs: number;
  holdMs: number;
  jumpCents: number;
}

export interface PitchSmoother {
  /** Feeds one frame; returns the steady frequency to show, or null when nothing is heard. */
  push(frame: PitchFrame): number | null;
  /** Forgets everything, e.g. when the mic restarts or a reference tone sounds. */
  reset(): void;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Turns jittery raw frames into a steady needle: the median of the recent
 * voiced frames. A frame far from the reading is held back until a second
 * one agrees, so a single octave glitch never shows. Silence keeps the last
 * reading for `holdMs` (a plucked note decays below the clarity gate long
 * before it stops ringing), then clears it.
 */
export function createPitchSmoother(
  options: Partial<SmootherOptions> = {},
  tracker: Pick<
    NoteTrackerOptions,
    'minClarity' | 'minFrequency' | 'maxFrequency'
  > = MIC_CONFIG.tracker,
): PitchSmoother {
  const { smoothingMs, holdMs, jumpCents } = { ...TUNER_CONFIG, ...options };
  let recent: PitchFrame[] = [];
  let pending: PitchFrame | null = null;
  let lastVoicedAt = -Infinity;

  const reading = () => (recent.length > 0 ? median(recent.map((f) => f.frequency)) : null);

  return {
    push(frame) {
      if (!isVoiced(frame, tracker)) {
        if (frame.at - lastVoicedAt > holdMs) {
          recent = [];
          pending = null;
        }
        return reading();
      }
      lastVoicedAt = frame.at;
      const current = reading();
      if (current !== null && Math.abs(centsBetween(frame.frequency, current)) > jumpCents) {
        const agrees =
          pending !== null &&
          Math.abs(centsBetween(frame.frequency, pending.frequency)) <= jumpCents;
        if (!agrees) {
          pending = frame;
          return current;
        }
        recent = [pending as PitchFrame];
      }
      pending = null;
      recent.push(frame);
      recent = recent.filter((f) => frame.at - f.at <= smoothingMs);
      return reading();
    },
    reset() {
      recent = [];
      pending = null;
      lastVoicedAt = -Infinity;
    },
  };
}

// --- Words for the readouts ---------------------------------------------------

/** `+12 cents`, `−3 cents`, `0 cents`: whole cents with a true minus sign. */
export function formatCents(cents: number): string {
  const whole = Math.round(cents);
  if (whole === 0) return '0 cents';
  return `${whole > 0 ? '+' : '−'}${Math.abs(whole)} ${Math.abs(whole) === 1 ? 'cent' : 'cents'}`;
}

/** `6th`, `1st`: how guitarists name strings. */
export function stringOrdinal(string: number): string {
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[string] ?? 'th';
  return `${string}${suffix}`;
}

/**
 * How to turn the nearest string's peg: `In tune`, `Tune up 12 cents`, or,
 * beyond half a semitone, `Tune down about 2 semitones`.
 */
export function pegAdvice(cents: number, inTuneCents: number = TUNER_CONFIG.inTuneCents): string {
  const advice = advise(cents, inTuneCents);
  if (advice === 'in-tune') return 'In tune';
  const way = advice === 'tune-up' ? 'Tune up' : 'Tune down';
  const off = Math.abs(cents);
  if (off <= 50) return `${way} ${formatCents(off).replace('+', '')}`;
  const semitones = Math.round(off / 100);
  return `${way} about ${semitones} ${semitones === 1 ? 'semitone' : 'semitones'}`;
}
