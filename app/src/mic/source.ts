import { Note } from 'tonal';
import { MIC_CONFIG } from './config';
import { createNoteTracker, midiToFrequency, type TrackerEvent } from './tracker';
import {
  PitchSourceError,
  type NoteEnd,
  type NoteTrackerOptions,
  type PitchDriver,
  type PitchFrame,
  type PitchSource,
  type PitchSourceErrorReason,
  type PitchSourceState,
  type StableNote,
  type Unsubscribe,
} from './types';

function toPitchSourceError(err: unknown): PitchSourceError {
  if (err instanceof PitchSourceError) return err;
  return new PitchSourceError('failed', err instanceof Error ? err.message : String(err));
}

/**
 * Wraps a driver with state, listeners and stable-note tracking. Driver starts
 * never overlap: a `start()` issued while a cancelled driver start is still
 * pending waits for it to settle (and be stopped) before starting again.
 */
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
  // A driver.start() that has not settled yet, whichever generation it belongs to.
  let inflight: Promise<void> | null = null;
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

  const launch = (gen: number): Promise<void> => {
    if (gen !== generation) return Promise.resolve();
    const emit = (frame: PitchFrame) => {
      if (gen !== generation || state !== 'running') return;
      frameListeners.forEach((l) => l(frame));
      dispatch(tracker.push(frame));
    };
    // The input went away. While running, release it and report the loss at
    // once; while starting (the driver's graph is up but its start has not
    // settled yet), report it when the start settles.
    let lostWhileStarting: PitchSourceError | null = null;
    const fail = (err: PitchSourceError) => {
      if (gen !== generation) return;
      if (state === 'starting') {
        lostWhileStarting ??= err;
        return;
      }
      if (state !== 'running') return;
      generation += 1;
      driver.stop();
      dispatch(tracker.flush());
      tracker = createNoteTracker(options);
      error = err;
      setState('error');
    };
    let started: Promise<void>;
    try {
      started = driver.start(emit, fail);
    } catch (err) {
      started = Promise.reject(err);
    }
    const settled = started
      .then(
        () => {
          // Cancelled meanwhile: release the device before any newer start runs.
          if (gen !== generation) driver.stop();
          else if (lostWhileStarting) {
            driver.stop();
            error = lostWhileStarting;
            setState('error');
            throw error;
          } else setState('running');
        },
        (err: unknown) => {
          if (gen !== generation) return;
          error = toPitchSourceError(err);
          setState('error');
          throw error;
        },
      )
      .finally(() => {
        if (inflight === guard) inflight = null;
        if (gen === generation) starting = null;
      });
    const guard: Promise<void> = settled.catch(() => undefined);
    inflight = guard;
    return settled;
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
      // Call the driver synchronously when idle, so it stays inside the user gesture.
      starting = inflight ? inflight.then(() => launch(gen)) : launch(gen);
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
  /** While running, loses the input (an unplugged mic): the source enters `error` with `lost`. */
  loseInput(): void;
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
  let lose: ((error: PitchSourceError) => void) | null = null;

  const source = createPitchSource(
    {
      start(e, fail) {
        startCalls += 1;
        if (failure) {
          const reason = failure;
          failure = null;
          return Promise.reject(new PitchSourceError(reason));
        }
        emit = e;
        lose = fail;
        return Promise.resolve();
      },
      stop() {
        emit = null;
        lose = null;
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
    loseInput: { value: () => lose?.(new PitchSourceError('lost', 'The microphone went away')) },
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
