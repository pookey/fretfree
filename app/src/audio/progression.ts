/**
 * Pure progression timing (design §9, M4 progression player). A progression
 * is a list of chords, each held for some beats and strummed in a pattern;
 * this turns it into strokes on a beat grid that `audio.ts` puts on the Tone
 * Transport. Times are in beats so a tempo change needs no recomputing.
 */
import { AUDIO } from './config';
import type { StrumDirection } from './strum';

export interface ProgressionChord {
  /** Pitches with octaves (`E2`, `B2`, …). None is a rest: time passes, nothing sounds. */
  notes: readonly string[];
  /** How long it is held. Defaults to the progression's `beatsPerChord`. */
  beats?: number;
}

export interface Stroke {
  /** Beat within the pattern's cycle. */
  beat: number;
  direction: StrumDirection;
}

export interface StrumPattern {
  strokes: readonly Stroke[];
  /** Beats in one cycle of the pattern, or `null` to strum once per chord. */
  cycle: number | null;
}

export const STRUM_PATTERNS = {
  /** One down-stroke per chord: the clearest for hearing a change. */
  once: { strokes: [{ beat: 0, direction: 'down' }], cycle: null },
  /** A down-stroke on every beat. */
  quarters: { strokes: [{ beat: 0, direction: 'down' }], cycle: 1 },
  /** Down-up on every beat. */
  eighths: {
    strokes: [
      { beat: 0, direction: 'down' },
      { beat: 0.5, direction: 'up' },
    ],
    cycle: 1,
  },
  /** The common folk pattern: D, D-U, -U-D-U. */
  folk: {
    strokes: [
      { beat: 0, direction: 'down' },
      { beat: 1, direction: 'down' },
      { beat: 1.5, direction: 'up' },
      { beat: 2.5, direction: 'up' },
      { beat: 3, direction: 'down' },
      { beat: 3.5, direction: 'up' },
    ],
    cycle: 4,
  },
} as const satisfies Record<string, StrumPattern>;

export type StrumPatternName = keyof typeof STRUM_PATTERNS;

export interface StrumEvent {
  /** Beats from the start of the progression. */
  beat: number;
  /** Index into the progression's chords. */
  chord: number;
  direction: StrumDirection;
  /** Beats until the next stroke (or the end), which is how long it rings. */
  length: number;
}

export interface ProgressionPlan {
  events: StrumEvent[];
  /** The beat each chord starts on, rests included, for highlighting the current chord. */
  chordStarts: number[];
  totalBeats: number;
}

export interface ProgressionTiming {
  pattern?: StrumPatternName | StrumPattern;
  beatsPerChord?: number;
}

function positive(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${what} must be a positive number`);
  return n;
}

/** Every stroke of a progression, in order, on a beat grid. */
export function planProgression(
  chords: readonly ProgressionChord[],
  timing: ProgressionTiming = {},
): ProgressionPlan {
  const pattern =
    typeof timing.pattern === 'string'
      ? STRUM_PATTERNS[timing.pattern]
      : (timing.pattern ?? STRUM_PATTERNS.once);
  const perChord = positive(
    timing.beatsPerChord ?? AUDIO.progression.beatsPerChord,
    'beatsPerChord',
  );
  if (pattern.cycle !== null) positive(pattern.cycle, 'Pattern cycle');

  const events: Omit<StrumEvent, 'length'>[] = [];
  const chordStarts: number[] = [];
  let start = 0;
  chords.forEach((chord, index) => {
    const span = positive(chord.beats ?? perChord, 'Chord beats');
    chordStarts.push(start);
    if (chord.notes.length > 0) {
      const cycle = pattern.cycle ?? span;
      for (let c = 0; c < span; c += cycle) {
        for (const s of pattern.strokes) {
          const at = c + s.beat;
          if (at < span && s.beat < cycle)
            events.push({ beat: start + at, chord: index, direction: s.direction });
        }
      }
    }
    start += span;
  });

  return {
    events: events.map((e, i) => ({ ...e, length: (events[i + 1]?.beat ?? start) - e.beat })),
    chordStarts,
    totalBeats: start,
  };
}

/** Seconds per beat at a tempo. */
export function beatSeconds(bpm: number): number {
  return 60 / positive(bpm, 'bpm');
}
