/**
 * Design §9 input: the pitch-input contract. A source turns the microphone
 * into a stream of {frequency, clarity} frames and, on top of that, stable-note
 * events (a note counts once it holds for ≥80ms). The real source (an
 * AudioWorklet running pitchy) and the fake source for tests both implement
 * `PitchSource`, so drills never know which one they are talking to.
 *
 * Times are milliseconds on the source's own clock (the AudioContext clock for
 * the real source, a virtual clock for the fake), never `Date.now()`.
 */

/** One analysis frame from the pitch detector. */
export interface PitchFrame {
  /** Detected fundamental in Hz; 0 when the detector found none. */
  readonly frequency: number;
  /** Detector confidence, 0–1 (pitchy's clarity). */
  readonly clarity: number;
  /** Time of the frame, in ms on the source clock. */
  readonly at: number;
}

/** A note that held steady long enough to count (design §9: ≥80ms). */
export interface StableNote {
  /** Nearest equal-tempered MIDI note. */
  readonly midi: number;
  /** Scientific pitch name with sharps, e.g. `F#3`. */
  readonly name: string;
  /** 0–11, C = 0. */
  readonly chroma: number;
  /** Median frequency over the frames seen so far, in Hz. */
  readonly frequency: number;
  /** Deviation of `frequency` from `midi`, in cents (−50…+50 for an in-tune note). */
  readonly cents: number;
  /** Time of the note's first frame. */
  readonly startedAt: number;
  /** Time at which the note became stable; `stableAt - startedAt ≥ minStableMs`. */
  readonly stableAt: number;
}

/** A stable note has stopped: silence, or a different pitch took over. */
export interface NoteEnd {
  readonly note: StableNote;
  /** Time of the note's last voiced frame. */
  readonly endedAt: number;
}

/**
 * - `idle`: never started, or stopped.
 * - `starting`: waiting for permission and audio start-up.
 * - `running`: frames are flowing.
 * - `error`: start failed; see `PitchSource.error`. `start()` may be retried.
 */
export type PitchSourceState = 'idle' | 'starting' | 'running' | 'error';

export type PitchSourceErrorReason =
  /** The learner (or the browser) refused microphone permission. */
  | 'denied'
  /** No getUserMedia or AudioWorklet in this browser. */
  | 'unsupported'
  /** Permission was granted but no input device exists. */
  | 'no-device'
  /** Anything else, e.g. the worklet failed to load. */
  | 'failed';

export class PitchSourceError extends Error {
  readonly reason: PitchSourceErrorReason;

  constructor(reason: PitchSourceErrorReason, message: string = `Pitch source ${reason}`) {
    super(message);
    this.name = 'PitchSourceError';
    this.reason = reason;
  }
}

export type Unsubscribe = () => void;

export interface PitchSource {
  readonly state: PitchSourceState;
  /** Set when `state` is `error`. */
  readonly error: PitchSourceError | null;
  /**
   * Requests the microphone (if not yet granted) and starts listening.
   *
   * **Call it from a user gesture handler** (a tap on "Enable mic" or "Start"),
   * before any other `await`: iOS only grants getUserMedia and resumes the
   * AudioContext inside the gesture. Never call it on page load (design §9:
   * permission is requested only when the learner enables mic mode).
   *
   * Idempotent while `starting` or `running`. Rejects with a `PitchSourceError`.
   * If `stop()` is called before it settles, it resolves (even if the driver
   * failed) without the source running: check `state` after awaiting it.
   */
  start(): Promise<void>;
  /** Stops listening and releases the microphone. Ends any sounding note. Idempotent. */
  stop(): void;
  /** Every analysis frame, voiced or not (the tuner draws these). */
  onFrame(listener: (frame: PitchFrame) => void): Unsubscribe;
  /** Fires once per note, when it becomes stable. */
  onNote(listener: (note: StableNote) => void): Unsubscribe;
  /** Fires when a note reported by `onNote` stops. */
  onNoteEnd(listener: (end: NoteEnd) => void): Unsubscribe;
  onStateChange(listener: (state: PitchSourceState) => void): Unsubscribe;
}

/**
 * The device-specific half of a source: it only produces frames.
 * `createPitchSource(driver)` adds state, listeners and stable-note tracking,
 * so the real detector (getUserMedia + AudioWorklet) and the fake behave alike.
 */
export interface PitchDriver {
  /**
   * Starts producing frames through `emit`; resolves once running. May reject
   * with a `PitchSourceError`. `createPitchSource` calls it synchronously from
   * `PitchSource.start()` (so it runs inside the user gesture) and never calls
   * it again until the previous call has settled and, if it resolved, `stop()`
   * has been called.
   */
  start(emit: (frame: PitchFrame) => void): Promise<void>;
  /**
   * Stops producing frames and releases the device. Called only after a
   * `start()` resolved, never while one is pending or after one rejected.
   */
  stop(): void;
}

/** Tunables for turning frames into stable notes. Defaults: `MIC_CONFIG.tracker`. */
export interface NoteTrackerOptions {
  /** A note counts once it has held for this long (design §9: 80ms). */
  minStableMs: number;
  /** Frames below this clarity are unvoiced. */
  minClarity: number;
  /** Frames outside this range (Hz) are unvoiced: they are noise, not a guitar note. */
  minFrequency: number;
  maxFrequency: number;
  /**
   * A frame continues the current note while it is within this many cents of
   * it. Above 50 gives hysteresis, so a note played slightly sharp or with
   * vibrato does not flicker between neighbours.
   */
  holdCents: number;
  /** Unvoiced gaps up to this long do not end a note (a single dropped frame, say). */
  dropoutMs: number;
}

/**
 * How strictly a played note must match the target. Pitch identifies the
 * pitch, not the string (design §6 mic constraint), and octave tolerance is
 * the drill's choice (design §9).
 */
export type PitchMatchMode = 'exact' | 'octave' | 'pitch-class';
