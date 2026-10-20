/**
 * The onset-input contract (design §12): taps and the mic both become a stream
 * of onsets on the audio clock, so a timing drill never knows which it hears.
 * A source wraps a driver (the tap listener, the mic worklet, or the fake for
 * tests) with state and listeners, the same split as `mic/source.ts`.
 *
 * Times are ms on the AudioContext clock (`currentTime × 1000`), the clock the
 * metronome schedules on. Source onsets are raw; `withLatency` takes the
 * learner's latency off them before grading.
 */
import type { AudioClock } from './clock';
import { compensate, type Compensation, type OnsetKind } from './latency';

export interface Onset {
  /** When the sound or tap began, in audio-clock ms. */
  readonly at: number;
  readonly kind: OnsetKind;
  /** Detector strength for a mic onset (normalised flux); 1 for a tap. */
  readonly strength: number;
}

/** An onset with the latency taken off: `at` is when the learner meant it. */
export interface CompensatedOnset extends Onset {
  readonly rawAt: number;
}

export type OnsetSourceState = 'idle' | 'starting' | 'running' | 'error';

export type OnsetSourceErrorReason = 'denied' | 'unsupported' | 'no-device' | 'failed' | 'lost';

export class OnsetSourceError extends Error {
  readonly reason: OnsetSourceErrorReason;

  constructor(reason: OnsetSourceErrorReason, message: string = `Onset source ${reason}`) {
    super(message);
    this.name = 'OnsetSourceError';
    this.reason = reason;
  }
}

export type Unsubscribe = () => void;

export interface OnsetSource {
  readonly kind: OnsetKind;
  readonly state: OnsetSourceState;
  readonly error: OnsetSourceError | null;
  /**
   * Starts listening. For the mic, call it from the tap that enables it,
   * before any other `await` (iOS grants the mic only inside a gesture).
   * Idempotent while starting or running; rejects with an `OnsetSourceError`.
   */
  start(): Promise<void>;
  /** Stops listening. Idempotent. */
  stop(): void;
  onOnset(listener: (onset: Onset) => void): Unsubscribe;
  onStateChange(listener: (state: OnsetSourceState) => void): Unsubscribe;
}

/** The device half of a source: it only produces onsets. */
export interface OnsetDriver {
  /** Starts emitting; calls `fail` (reason `lost`) if a running input goes away. */
  start(emit: (onset: Onset) => void, fail: (error: OnsetSourceError) => void): Promise<void>;
  /** Called only after a `start()` resolved. */
  stop(): void;
}

function toError(err: unknown): OnsetSourceError {
  if (err instanceof OnsetSourceError) return err;
  return new OnsetSourceError('failed', err instanceof Error ? err.message : String(err));
}

function listeners<T>() {
  const set = new Set<(value: T) => void>();
  return {
    add(listener: (value: T) => void): Unsubscribe {
      set.add(listener);
      return () => set.delete(listener);
    },
    emit(value: T) {
      set.forEach((l) => l(value));
    },
  };
}

/** Wraps a driver with state and listeners. A stop while starting wins. */
export function createOnsetSource(kind: OnsetKind, driver: OnsetDriver): OnsetSource {
  const onsets = listeners<Onset>();
  const states = listeners<OnsetSourceState>();
  let state: OnsetSourceState = 'idle';
  let error: OnsetSourceError | null = null;
  let starting: Promise<void> | null = null;
  let generation = 0;

  const setState = (next: OnsetSourceState) => {
    if (next === state) return;
    state = next;
    states.emit(next);
  };

  return {
    kind,
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    start() {
      if (state === 'running') return Promise.resolve();
      if (starting) return starting;
      const gen = ++generation;
      error = null;
      setState('starting');
      const emit = (onset: Onset) => {
        if (gen === generation && state === 'running') onsets.emit(onset);
      };
      const fail = (err: OnsetSourceError) => {
        if (gen !== generation || state !== 'running') return;
        generation += 1;
        driver.stop();
        error = err;
        setState('error');
      };
      let started: Promise<void>;
      try {
        started = driver.start(emit, fail);
      } catch (err) {
        started = Promise.reject(err);
      }
      starting = started.then(
        () => {
          starting = null;
          if (gen !== generation) driver.stop();
          else setState('running');
        },
        (err: unknown) => {
          starting = null;
          if (gen !== generation) return;
          error = toError(err);
          setState('error');
          throw error;
        },
      );
      return starting;
    },
    stop() {
      if (state === 'idle' || state === 'error') return;
      const wasRunning = state === 'running';
      generation += 1;
      starting = null;
      if (wasRunning) driver.stop();
      setState('idle');
    },
    onOnset: onsets.add,
    onStateChange: states.add,
  };
}

/** Listens to `source`, handing on each onset with `compensation()` taken off. Read per onset. */
export function withLatency(
  source: Pick<OnsetSource, 'onOnset'>,
  compensation: () => Compensation,
  listener: (onset: CompensatedOnset) => void,
): Unsubscribe {
  return source.onOnset((onset) =>
    listener({ ...onset, rawAt: onset.at, at: compensate(onset.at, compensation()) }),
  );
}

// --- Taps --------------------------------------------------------------------

/** A pointer or key press, as much of an Event as the tap driver reads. */
export interface TapEvent {
  readonly type: string;
  /** Page-clock ms (`performance.now()` domain). */
  readonly timeStamp: number;
  readonly key?: string;
  readonly repeat?: boolean;
  readonly button?: number;
}

/** Keys that count as a tap by default: Space and Enter, as on a button. */
export const TAP_KEYS: readonly string[] = [' ', 'Enter'];

export interface TapSource extends OnsetSource {
  /** Taps on `target` (pointer down, and the tap keys) count while running. Returns a detach. */
  attach(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): Unsubscribe;
  /** Feed one event by hand; ignored unless running. */
  handle(event: TapEvent): void;
}

/**
 * Taps from pointer and keyboard, put on the audio clock by `clock`. A pointer
 * tap counts on press, not release (the moment of the stroke); held keys
 * don't repeat, and secondary mouse buttons don't count.
 */
export function createTapOnsetSource(
  clock: AudioClock,
  { keys = TAP_KEYS }: { keys?: readonly string[] } = {},
): TapSource {
  let emit: ((onset: Onset) => void) | null = null;
  const source = createOnsetSource('tap', {
    start(e) {
      clock.start();
      emit = e;
      return Promise.resolve();
    },
    stop() {
      clock.stop();
      emit = null;
    },
  });
  const handle = (event: TapEvent) => {
    if (!emit) return;
    if (event.type === 'keydown') {
      if (event.repeat || !event.key || !keys.includes(event.key)) return;
    } else if (event.type !== 'pointerdown' || (event.button ?? 0) !== 0) return;
    const at = clock.toContextMs(event.timeStamp);
    if (at !== null) emit({ at, kind: 'tap', strength: 1 });
  };
  const listener = (event: Event) => {
    if (event.type === 'keydown' && emit && keys.includes((event as KeyboardEvent).key))
      event.preventDefault(); // Space would scroll the page, Enter re-press a focused button.
    handle(event as unknown as TapEvent);
  };
  return Object.assign(source, {
    handle,
    attach(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>) {
      target.addEventListener('pointerdown', listener);
      target.addEventListener('keydown', listener);
      return () => {
        target.removeEventListener('pointerdown', listener);
        target.removeEventListener('keydown', listener);
      };
    },
  });
}

// --- Fake (tests and e2e) ----------------------------------------------------

export interface FakeOnsetSource extends OnsetSource {
  /** Emits an onset at `at` (audio-clock ms), if running. */
  emit(at: number, strength?: number): void;
  failNextStart(reason: OnsetSourceErrorReason): void;
  /** While running, loses the input: the source enters `error` with `lost`. */
  loseInput(): void;
  readonly startCalls: number;
}

export function createFakeOnsetSource(kind: OnsetKind = 'tap'): FakeOnsetSource {
  let emit: ((onset: Onset) => void) | null = null;
  let lose: ((error: OnsetSourceError) => void) | null = null;
  let failure: OnsetSourceErrorReason | null = null;
  let startCalls = 0;
  const source = createOnsetSource(kind, {
    start(e, fail) {
      startCalls += 1;
      if (failure) {
        const reason = failure;
        failure = null;
        return Promise.reject(new OnsetSourceError(reason));
      }
      emit = e;
      lose = fail;
      return Promise.resolve();
    },
    stop() {
      emit = null;
      lose = null;
    },
  });
  return Object.defineProperties(source as FakeOnsetSource, {
    emit: { value: (at: number, strength = 1) => emit?.({ at, kind, strength }) },
    failNextStart: { value: (reason: OnsetSourceErrorReason) => (failure = reason) },
    loseInput: { value: () => lose?.(new OnsetSourceError('lost', 'The input went away')) },
    startCalls: { get: () => startCalls },
  });
}
