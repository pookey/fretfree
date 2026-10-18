import { midiToFretNote } from '../theory';
import { MIC_CONFIG } from './config';
import type { NoteEnd, NoteTrackerOptions, PitchFrame, PitchMatchMode, StableNote } from './types';

// --- Pitch maths ------------------------------------------------------------

/** Fractional MIDI note for a frequency (A4 = 69). */
export function frequencyToMidi(frequency: number, a4: number = MIC_CONFIG.a4): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

export function midiToFrequency(midi: number, a4: number = MIC_CONFIG.a4): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Cents from the equal-tempered `midi` note to `frequency`. */
export function centsOff(frequency: number, midi: number, a4: number = MIC_CONFIG.a4): number {
  return (frequencyToMidi(frequency, a4) - midi) * 100;
}

/**
 * Whether a played MIDI note satisfies a target under a drill's match mode.
 * `octave` forgives an octave error either way (a common detector error);
 * `pitch-class` accepts any octave.
 */
export function pitchMatches(played: number, target: number, mode: PitchMatchMode): boolean {
  const diff = played - target;
  if (mode === 'exact') return diff === 0;
  if (diff % 12 !== 0) return false;
  return mode === 'pitch-class' || Math.abs(diff) <= 12;
}

// --- Stable-note tracking ---------------------------------------------------

export type TrackerEvent = { type: 'note'; note: StableNote } | { type: 'note-end'; end: NoteEnd };

export interface NoteTracker {
  /** Feeds one frame; returns the note events it caused, in order. Frame times must not go backwards. */
  push(frame: PitchFrame): TrackerEvent[];
  /** Ends the current note (if stable) and forgets it, e.g. on stop. */
  flush(): TrackerEvent[];
}

interface Run {
  midi: number;
  startedAt: number;
  lastVoicedAt: number;
  frequencies: number[];
  stable: StableNote | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Pure and clock-free: turns a frame stream into stable-note events.
 *
 * A note becomes stable once voiced frames within `holdCents` of it span
 * `minStableMs`. Before that, a frame at another pitch restarts the clock (a
 * pick transient). Once stable, a deviant frame (an octave error, say) is only
 * a challenger: the note ends when the challenger itself becomes stable, or
 * after more than `dropoutMs` of silence. So a glitch never splits one pluck
 * into two notes, while re-picking the same note after a short silence still
 * counts again.
 */
export function createNoteTracker(
  options: Partial<NoteTrackerOptions> = {},
  a4: number = MIC_CONFIG.a4,
): NoteTracker {
  const opts: NoteTrackerOptions = { ...MIC_CONFIG.tracker, ...options };
  let current: Run | null = null;
  let challenger: Run | null = null;

  const begin = (midi: number, at: number): Run => ({
    midi,
    startedAt: at,
    lastVoicedAt: at,
    frequencies: [],
    stable: null,
  });

  const add = (run: Run, frame: PitchFrame) => {
    run.frequencies.push(frame.frequency);
    run.lastVoicedAt = frame.at;
  };

  const end = (): TrackerEvent[] => {
    const done = current;
    current = null;
    return done?.stable
      ? [{ type: 'note-end', end: { note: done.stable, endedAt: done.lastVoicedAt } }]
      : [];
  };

  // Silent for longer than a dropout: neither the note nor a challenger was heard.
  const silentSince = (run: Run, at: number) =>
    at - Math.max(run.lastVoicedAt, challenger?.lastVoicedAt ?? -Infinity) > opts.dropoutMs;

  return {
    push(frame) {
      const events: TrackerEvent[] = [];
      if (current && silentSince(current, frame.at)) {
        events.push(...end());
        challenger = null;
      }

      const voiced =
        frame.clarity >= opts.minClarity &&
        frame.frequency >= opts.minFrequency &&
        frame.frequency <= opts.maxFrequency;
      if (!voiced) return events;

      const midiFloat = frequencyToMidi(frame.frequency, a4);
      const near = (run: Run) => Math.abs(midiFloat - run.midi) * 100 <= opts.holdCents;
      if (current && near(current)) {
        challenger = null;
        add(current, frame);
      } else if (!current?.stable) {
        current = begin(Math.round(midiFloat), frame.at);
        add(current, frame);
      } else {
        if (!challenger || !near(challenger)) challenger = begin(Math.round(midiFloat), frame.at);
        add(challenger, frame);
        if (frame.at - challenger.startedAt >= opts.minStableMs) {
          events.push(...end());
          current = challenger;
          challenger = null;
        }
      }

      if (current && !current.stable && frame.at - current.startedAt >= opts.minStableMs) {
        const frequency = median(current.frequencies);
        const { name, chroma } = midiToFretNote(current.midi);
        current.stable = {
          midi: current.midi,
          name,
          chroma,
          frequency,
          cents: centsOff(frequency, current.midi, a4),
          startedAt: current.startedAt,
          stableAt: frame.at,
        };
        events.push({ type: 'note', note: current.stable });
      }
      return events;
    },
    flush() {
      challenger = null;
      return end();
    },
  };
}
