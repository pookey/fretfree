/**
 * D27 on the timing engine (M8-01): one rep, and hearing the bar first.
 *
 * A rep starts the input, then the shared metronome counts in and clicks
 * through the bar's times through. Onsets have the latency taken off as they
 * arrive (`withLatency`, read per onset, so a recalibration takes effect at
 * once), and the targets are read back from the click's tempo map
 * (`timeAtPulse`) when the run ends, so they hold through a tempo change.
 *
 * The click runs on the bar's grid (`subdivide` steps a pulse) so the caret
 * can follow every note, but only the beats sound unless `subdivided`.
 */
import type { Compensation } from '../../timing/latency';
import type { ClickMeter } from '../../timing/meter';
import { pulsesPerBar } from '../../timing/meter';
import type { Click, Metronome, MetronomeOptions } from '../../timing/metronome';
import { withLatency, type OnsetSource } from '../../timing/onsets';

export interface ReadingRunDeps {
  metronome: Metronome;
  source: OnsetSource;
  /** What to take off an onset now: `liveCompensation(kind, settings.timingOffsets)`. */
  compensation: () => Compensation;
}

export interface ReadingRunOptions {
  meter: ClickMeter;
  bpm: number;
  /** Click steps per pulse, 1–4. */
  subdivide: number;
  countInBars: number;
  bars: number;
  /** The notes, in pulses from the first beat after the count-in. */
  pulses: readonly number[];
  /** More pulses to read back as times (the partner's notes); default none. */
  alsoPulses?: readonly number[];
  /** Sound the steps between the beats. */
  subdivided: boolean;
  /**
   * How long past the last note, beyond the latency taken off onsets, the
   * run waits for its onset: the grade's match window plus a margin. Default 0.
   */
  settleMs?: number;
}

export interface ReadingTake {
  targetsMs: number[];
  alsoMs: number[];
  onsetsMs: number[];
}

export interface ReadingRun {
  /** The take; `null` if cancelled, or audio or the input stopped or wouldn't start. */
  readonly done: Promise<ReadingTake | null>;
  cancel(): void;
}

/** Which clicks sound in a rep: the beats (all of them when subdivided), and nothing past the bar. */
export function repFade(end: number, subdivided: boolean) {
  return (c: Pick<Click, 'pulse' | 'accent'>) =>
    c.pulse < end && (subdivided || c.accent !== 'sub');
}

/**
 * Starts the input, then the click. Call it from the learner's tap: audio and
 * the mic unlock only inside a gesture. Rejects only if the input fails to
 * start, with its `OnsetSourceError`.
 */
export function runReading(deps: ReadingRunDeps, options: ReadingRunOptions): ReadingRun {
  const { metronome, source } = deps;
  const end = options.bars * pulsesPerBar(options.meter);
  const onsets: number[] = [];
  let settle!: (take: ReadingTake | null) => void;
  let fail!: (err: unknown) => void;
  const done = new Promise<ReadingTake | null>((resolve, reject) => {
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
  const finish = (take: Pick<ReadingTake, 'onsetsMs'> | null) => {
    if (finished) return;
    // Read before the stop: the tempo map goes with the run.
    const read = (pulses: readonly number[]) => pulses.map((p) => metronome.timeAtPulse(p));
    const targets = take ? read(options.pulses) : [];
    const also = take ? read(options.alsoPulses ?? []) : [];
    stop();
    const known = (ts: (number | null)[]): ts is number[] => ts.every((t) => t !== null);
    settle(
      take && known(targets) && known(also)
        ? { targetsMs: targets, alsoMs: also, onsetsMs: take.onsetsMs }
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
  // The run ends on a silent click past the bar, once an onset for the last
  // note would be in: the learner hears that note `outputMs` late and plays
  // it `calibrationMs` later still, and may be up to `settleMs` off.
  const last = options.pulses.at(-1);
  const onBeat = (click: Click) => {
    if (click.pulse < end) return;
    const lastAt = last === undefined ? null : metronome.timeAtPulse(last);
    const c = deps.compensation();
    const due = (lastAt ?? click.at) + c.outputMs + c.calibrationMs + (options.settleMs ?? 0);
    if (click.at >= due) finish({ onsetsMs: [...onsets] });
  };

  void source
    .start()
    .then(async () => {
      listening = true;
      if (finished) return;
      const started = await metronome.start({
        meter: options.meter,
        bpm: options.bpm,
        subdivide: options.subdivide,
        countInBars: options.countInBars,
        fade: repFade(end, options.subdivided),
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

/**
 * The click that plays the bar, for hearing it before reading it (design
 * §12): a bar of beats to count in, then a click on each note (`steps`, in
 * click steps from the bar's start), and nothing between them.
 */
export function hearOptions(
  meter: ClickMeter,
  bpm: number,
  subdivide: number,
  steps: readonly number[],
): MetronomeOptions {
  const sounding = new Set(steps);
  return {
    meter,
    bpm,
    subdivide,
    countInBars: 1,
    fade: (click) =>
      click.countIn
        ? Number.isInteger(click.pulse)
        : sounding.has(Math.round(click.pulse * subdivide)),
  };
}
