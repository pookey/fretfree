import { Note } from 'tonal';
import { midiToFretNote } from '../theory';
import {
  PitchSourceError,
  type NoteEnd,
  type NoteTrackerOptions,
  type PitchDriver,
  type PitchFrame,
  type PitchMatchMode,
  type PitchSource,
  type PitchSourceErrorReason,
  type PitchSourceState,
  type StableNote,
  type Unsubscribe,
} from './types';

export * from './types';

/** Every mic tunable (design §9). Change values here, not inline. */
export const MIC_CONFIG = {
  /** Concert pitch, in Hz. */
  a4: 440,
  tracker: {
    minStableMs: 80,
    minClarity: 0.9,
    // Low B on a 7-string is ~62 Hz; the 24th fret of high E is ~1319 Hz.
    minFrequency: 60,
    maxFrequency: 1500,
    holdCents: 65,
    dropoutMs: 50,
  } satisfies NoteTrackerOptions,
  /** The fake source's frame period; about one 1024-sample pitchy window at 44.1 kHz. */
  fakeFrameMs: 20,
} as const;

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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Pure and clock-free: turns a frame stream into stable-note events. A note
 * becomes stable once voiced frames within `holdCents` of it span
 * `minStableMs`; it ends on a different pitch or an unvoiced gap longer than
 * `dropoutMs` (so re-picking the same note after a short silence counts again).
 */
export function createNoteTracker(
  options: Partial<NoteTrackerOptions> = {},
  a4: number = MIC_CONFIG.a4,
): NoteTracker {
  const opts: NoteTrackerOptions = { ...MIC_CONFIG.tracker, ...options };
  let current: {
    midi: number;
    startedAt: number;
    lastVoicedAt: number;
    frequencies: number[];
    stable: StableNote | null;
  } | null = null;

  const end = (): TrackerEvent[] => {
    const done = current;
    current = null;
    return done?.stable
      ? [{ type: 'note-end', end: { note: done.stable, endedAt: done.lastVoicedAt } }]
      : [];
  };

  return {
    push(frame) {
      const voiced =
        frame.clarity >= opts.minClarity &&
        frame.frequency >= opts.minFrequency &&
        frame.frequency <= opts.maxFrequency;
      const gapped = current !== null && frame.at - current.lastVoicedAt > opts.dropoutMs;
      if (!voiced) return gapped ? end() : [];

      const events: TrackerEvent[] = [];
      const midiFloat = frequencyToMidi(frame.frequency, a4);
      if (current && (gapped || Math.abs(midiFloat - current.midi) * 100 > opts.holdCents)) {
        events.push(...end());
      }
      if (!current) {
        current = {
          midi: Math.round(midiFloat),
          startedAt: frame.at,
          lastVoicedAt: frame.at,
          frequencies: [],
          stable: null,
        };
      }
      current.frequencies.push(frame.frequency);
      current.lastVoicedAt = frame.at;
      if (!current.stable && frame.at - current.startedAt >= opts.minStableMs) {
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
    flush: end,
  };
}

// --- Sources ----------------------------------------------------------------

function toPitchSourceError(err: unknown): PitchSourceError {
  if (err instanceof PitchSourceError) return err;
  return new PitchSourceError('failed', err instanceof Error ? err.message : String(err));
}

/** Wraps a driver with state, listeners and stable-note tracking. */
export function createPitchSource(
  driver: PitchDriver,
  options: Partial<NoteTrackerOptions> = {},
): PitchSource {
  const frameListeners = new Set<(frame: PitchFrame) => void>();
  const noteListeners = new Set<(note: StableNote) => void>();
  const endListeners = new Set<(end: NoteEnd) => void>();
  const stateListeners = new Set<(state: PitchSourceState) => void>();
  let tracker = createNoteTracker(options);
  let state: PitchSourceState = 'idle';
  let error: PitchSourceError | null = null;
  let starting: Promise<void> | null = null;
  // Bumped by stop(), so a start that resolves after a stop is discarded.
  let generation = 0;

  const listen =
    <T>(set: Set<(value: T) => void>) =>
    (listener: (value: T) => void): Unsubscribe => {
      set.add(listener);
      return () => set.delete(listener);
    };

  const setState = (next: PitchSourceState) => {
    if (next === state) return;
    state = next;
    stateListeners.forEach((l) => l(next));
  };

  const dispatch = (events: TrackerEvent[]) => {
    for (const e of events) {
      if (e.type === 'note') noteListeners.forEach((l) => l(e.note));
      else endListeners.forEach((l) => l(e.end));
    }
  };

  return {
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    start() {
      if (state === 'running') return Promise.resolve();
      if (starting) return starting;
      const gen = generation;
      error = null;
      setState('starting');
      const emit = (frame: PitchFrame) => {
        if (gen !== generation || state !== 'running') return;
        frameListeners.forEach((l) => l(frame));
        dispatch(tracker.push(frame));
      };
      starting = driver.start(emit).then(
        () => {
          starting = null;
          if (gen !== generation) {
            driver.stop();
            return;
          }
          setState('running');
        },
        (err: unknown) => {
          starting = null;
          if (gen !== generation) return;
          error = toPitchSourceError(err);
          setState('error');
          throw error;
        },
      );
      return starting;
    },
    stop() {
      if (state === 'idle' || state === 'error') return;
      generation += 1;
      const wasRunning = state === 'running';
      starting = null;
      if (wasRunning) driver.stop();
      dispatch(tracker.flush());
      tracker = createNoteTracker(options);
      setState('idle');
    },
    onFrame: listen(frameListeners),
    onNote: listen(noteListeners),
    onNoteEnd: listen(endListeners),
    onStateChange: listen(stateListeners),
  };
}

// --- Fake source (tests and e2e) ---------------------------------------------

export interface FakePlayOptions {
  /** Default 300ms: comfortably past the 80ms stability threshold. */
  durationMs?: number;
  /** Detune, in cents. */
  cents?: number;
  /** Default 0.98. */
  clarity?: number;
}

/**
 * A `PitchSource` driven by the test instead of a microphone. It keeps a
 * virtual clock that only `play`, `silence` and `frame` advance, so tests are
 * deterministic. Like a real mic, sound made while it is not running is not
 * heard, but the clock still moves.
 */
export interface FakePitchSource extends PitchSource {
  /** The virtual clock, in ms. */
  readonly now: number;
  /** How many times the driver was asked to start (i.e. permission prompts). */
  readonly startCalls: number;
  /** Makes the next `start()` fail, e.g. with `denied`. */
  failNextStart(reason: PitchSourceErrorReason): void;
  /** Emits one raw frame at the current time, then advances the clock by one frame. */
  frame(frequency: number, clarity?: number): void;
  /** Sustains a note (MIDI number or name like `A2`) as a run of frames. */
  play(note: number | string, options?: FakePlayOptions): void;
  /** Emits unvoiced frames for `durationMs`. */
  silence(durationMs: number): void;
}

export function createFakePitchSource(
  options: { frameMs?: number; startAt?: number; tracker?: Partial<NoteTrackerOptions> } = {},
): FakePitchSource {
  const frameMs = options.frameMs ?? MIC_CONFIG.fakeFrameMs;
  let now = options.startAt ?? 0;
  let startCalls = 0;
  let failure: PitchSourceErrorReason | null = null;
  let emit: ((frame: PitchFrame) => void) | null = null;

  const source = createPitchSource(
    {
      start(e) {
        startCalls += 1;
        if (failure) {
          const reason = failure;
          failure = null;
          return Promise.reject(new PitchSourceError(reason));
        }
        emit = e;
        return Promise.resolve();
      },
      stop() {
        emit = null;
      },
    },
    options.tracker,
  );

  const frame = (frequency: number, clarity = 0.98) => {
    emit?.({ frequency, clarity, at: now });
    now += frameMs;
  };

  const run = (durationMs: number, frequency: number, clarity: number) => {
    const frames = Math.max(1, Math.ceil(durationMs / frameMs));
    for (let i = 0; i < frames; i += 1) frame(frequency, clarity);
  };

  return Object.defineProperties(source as FakePitchSource, {
    now: { get: () => now },
    startCalls: { get: () => startCalls },
    failNextStart: {
      value: (reason: PitchSourceErrorReason) => {
        failure = reason;
      },
    },
    frame: { value: frame },
    play: {
      value: (note: number | string, opts: FakePlayOptions = {}) => {
        const midi = typeof note === 'number' ? note : Note.midi(note);
        if (midi === null) throw new Error(`Invalid note: ${note}`);
        const frequency = midiToFrequency(midi + (opts.cents ?? 0) / 100);
        run(opts.durationMs ?? 300, frequency, opts.clarity ?? 0.98);
      },
    },
    silence: { value: (durationMs: number) => run(durationMs, 0, 0) },
  });
}

// --- The app's source --------------------------------------------------------

let factory: (() => PitchSource) | null = null;
let shared: PitchSource | null = null;

/** Until a detector is provided, starting reports `unsupported`. */
function unsupportedSource(): PitchSource {
  return createPitchSource({
    start: () => Promise.reject(new PitchSourceError('unsupported', 'No pitch detector installed')),
    stop: () => undefined,
  });
}

/**
 * Installs how the app's pitch source is built: the real detector at start-up,
 * or a fake in tests and e2e. Replaces (and stops) any source already built.
 */
export function setPitchSourceFactory(next: (() => PitchSource) | null): void {
  shared?.stop();
  shared = null;
  factory = next;
}

/** The app-wide pitch source; one microphone, shared by the tuner and mic drills. Built lazily. */
export function getPitchSource(): PitchSource {
  return (shared ??= (factory ?? unsupportedSource)());
}
