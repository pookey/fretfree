/**
 * One D20 rep on the timing engine (M8-01): the input starts, then the
 * shared metronome counts in and clicks through the rhythm's bars. Onsets
 * have the latency taken off as they arrive (`withLatency`, read per onset,
 * so a recalibration takes effect at once), and the targets are read back
 * from the click's tempo map (`timeAtPulse`) when the run ends.
 *
 * The click runs on eighths (`subdivide: 2`) so a guide can follow every
 * step, but the "&" clicks sound only when `subdivided`.
 */
import type { Compensation } from '../../timing/latency';
import { METER_PRESETS } from '../../timing/meter';
import type { Click, Metronome } from '../../timing/metronome';
import { withLatency, type OnsetSource } from '../../timing/onsets';
import { STEPS_PER_BAR, STEPS_PER_PULSE } from './patterns';

export interface RhythmRunDeps {
  metronome: Metronome;
  source: OnsetSource;
  /** What to take off an onset now: `liveCompensation(kind, settings.timingOffsets)`. */
  compensation: () => Compensation;
}

export interface RhythmRunOptions {
  bpm: number;
  countInBars: number;
  bars: number;
  /** The hits, in pulses from the first beat after the count-in. */
  pulses: readonly number[];
  /** Sound the "&" between beats. */
  subdivided: boolean;
  /**
   * How long past the last hit, beyond the latency taken off onsets, the run
   * waits for its onset: the grade's match window plus a margin. Default 0.
   */
  settleMs?: number;
}

export interface RhythmTake {
  targetsMs: number[];
  onsetsMs: number[];
}

export interface RhythmRun {
  /** The take; `null` if cancelled, or audio or the input stopped or wouldn't start. */
  readonly done: Promise<RhythmTake | null>;
  cancel(): void;
}

const PULSES_PER_BAR = STEPS_PER_BAR / STEPS_PER_PULSE;

/**
 * Starts the input, then the click. Call it from the learner's tap: audio
 * and the mic unlock only inside a gesture. Rejects only if the input fails
 * to start, with its `OnsetSourceError`.
 */
export function runRhythm(deps: RhythmRunDeps, options: RhythmRunOptions): RhythmRun {
  const { metronome, source } = deps;
  const end = options.bars * PULSES_PER_BAR;
  const onsets: number[] = [];
  let settle!: (take: RhythmTake | null) => void;
  let fail!: (err: unknown) => void;
  const done = new Promise<RhythmTake | null>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  let finished = false;
  let listening = false;
  const unsubscribe: (() => void)[] = [];
  const stop = () => {
    finished = true;
    unsubscribe.splice(0).forEach((u) => u());
    metronome.stop();
    source.stop();
  };
  const finish = (take: RhythmTake | null) => {
    if (finished) return;
    // Read before the stop: the tempo map goes with the run.
    const targets = take ? options.pulses.map((p) => metronome.timeAtPulse(p)) : [];
    stop();
    settle(
      take && targets.every((t): t is number => t !== null)
        ? { ...take, targetsMs: targets }
        : null,
    );
  };

  unsubscribe.push(
    withLatency(source, deps.compensation, (o) => onsets.push(o.at)),
    source.onStateChange((state) => {
      // A failed start rejects instead (below); this is an input lost mid-run.
      if (state === 'error' && listening) finish(null);
    }),
  );
  // The run ends on a silent click past the rhythm, once an onset for the last
  // hit would be in: the learner hears that hit `outputMs` late and plays it
  // `calibrationMs` later still, and may be up to `settleMs` off.
  const last = options.pulses.at(-1);
  const onBeat = (click: Click) => {
    if (click.pulse < end) return;
    const lastAt = last === undefined ? null : metronome.timeAtPulse(last);
    const c = deps.compensation();
    const due = (lastAt ?? click.at) + c.outputMs + c.calibrationMs + (options.settleMs ?? 0);
    if (click.at >= due) finish({ targetsMs: [], onsetsMs: [...onsets] });
  };

  void source
    .start()
    .then(async () => {
      listening = true;
      if (finished) return;
      const started = await metronome.start({
        meter: METER_PRESETS['4/4'],
        bpm: options.bpm,
        subdivide: STEPS_PER_PULSE,
        countInBars: options.countInBars,
        // Silent past the rhythm: the beat that ends it isn't heard.
        fade: (c) => c.pulse < end && (options.subdivided || c.accent !== 'sub'),
      });
      if (!started) return finish(null);
      // Only now: starting the shared metronome stops (and so reports) any run before ours.
      if (!finished)
        unsubscribe.push(
          metronome.onBeat(onBeat),
          metronome.onStop(() => finish(null)),
        );
    })
    .catch((err: unknown) => {
      if (finished) return;
      stop();
      fail(err);
    });

  return { done, cancel: () => finish(null) };
}
