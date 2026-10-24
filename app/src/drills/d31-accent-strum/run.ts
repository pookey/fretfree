/**
 * One D31 rep on the timing engine (M8-01): the input starts, then the shared
 * metronome counts in and clicks through the bars. Onsets have the latency
 * taken off as they arrive (`withLatency`, read per onset), and the targets
 * are read back from the click's tempo map (`timeAtPulse`) at the end.
 *
 * **The click fades** as the rep goes (design §12): once a bar's last stroke
 * could have been heard, the bar is scored (`rateBar`) and the fade ladder
 * steps up or down (`fadeStep`, research/02 rule 5). Each bar keeps the rung
 * it started on, from its first scheduled click, so a step lands on the next
 * bar that hasn't started: the click changes on a downbeat, never mid-bar.
 */
import { NO_FADE, fadeStep, isAudible, type ClickFade } from '../../timing/fade';
import type { Compensation } from '../../timing/latency';
import { pulsesPerBar, type ClickMeter } from '../../timing/meter';
import type { Click, Metronome } from '../../timing/metronome';
import { withLatency, type OnsetSource } from '../../timing/onsets';
import type { ClickInfo } from '../../timing/tempo';
import type { D31Onset } from './logic';

export interface AccentRunDeps {
  metronome: Metronome;
  source: OnsetSource;
  /** What to take off an onset now: `liveCompensation(kind, settings.timingOffsets)`. */
  compensation: () => Compensation;
}

export interface AccentRunOptions {
  meter: ClickMeter;
  /** Clicks per pulse at the fullest rung (the steps of the grid). */
  stepsPerPulse: number;
  bpm: number;
  countInBars: number;
  bars: number;
  /** Every stroke, in pulses from the first beat after the count-in. */
  pulses: readonly number[];
  /** The fade ladder, fullest first, and the rung the first bar plays on. */
  ladder: readonly ClickFade[];
  startRung: number;
  /** The share of a bar's strokes played right, from their targets and the onsets so far. */
  rateBar(bar: number, targetsMs: number[], onsets: readonly D31Onset[]): number;
  /** A bar has started on a rung: for the status line. */
  onBar?(bar: number, rung: number): void;
  /**
   * How long past the last stroke, beyond the latency taken off onsets, the
   * run waits for its onset: the grade's match window plus a margin. Default 0.
   */
  settleMs?: number;
}

export interface AccentTake {
  targetsMs: number[];
  onsets: D31Onset[];
  /** The rung each bar was played on. */
  rungs: number[];
}

export interface AccentRun {
  /** The take; `null` if cancelled, or audio or the input stopped or wouldn't start. */
  readonly done: Promise<AccentTake | null>;
  cancel(): void;
}

/**
 * Starts the input, then the click. Call it from the learner's tap: audio and
 * the mic unlock only inside a gesture. Rejects only if the input fails to
 * start, with its `OnsetSourceError`.
 */
export function runAccents(deps: AccentRunDeps, options: AccentRunOptions): AccentRun {
  const { metronome, source } = deps;
  const perBar = pulsesPerBar(options.meter);
  const end = options.bars * perBar;
  const top = Math.max(0, options.ladder.length - 1);
  const barOf = (pulse: number) => Math.floor(pulse / perBar);
  const strokesOf = (bar: number) => options.pulses.filter((p) => barOf(p) === bar);
  const onsets: D31Onset[] = [];
  const rungs: number[] = [];
  let rung = Math.max(0, Math.min(top, options.startRung));
  /** The next bar to score. */
  let scoring = 0;
  let settle!: (take: AccentTake | null) => void;
  let fail!: (err: unknown) => void;
  const done = new Promise<AccentTake | null>((resolve, reject) => {
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
  const finish = (ok: boolean) => {
    if (finished) return;
    // Read before the stop: the tempo map goes with the run.
    const targets = ok ? options.pulses.map((p) => metronome.timeAtPulse(p)) : [];
    stop();
    settle(
      ok && targets.every((t): t is number => t !== null)
        ? { targetsMs: targets, onsets: [...onsets], rungs: rungs.slice(0, options.bars) }
        : null,
    );
  };

  // Which clicks sound: the count-in always; each bar on the rung it started on; nothing past the end.
  const audible = (click: ClickInfo): boolean => {
    if (click.countIn) return true;
    if (click.pulse >= end) return false;
    if (rungs[click.bar] === undefined) {
      rungs[click.bar] = rung;
      options.onBar?.(click.bar, rung);
    }
    return isAudible(click, options.ladder[rungs[click.bar]!] ?? NO_FADE);
  };

  /** When an onset for `pulse` would be in: heard `outputMs` late, played `calibrationMs` later, up to `settleMs` off. */
  const dueAfter = (pulse: number): number | null => {
    const at = metronome.timeAtPulse(pulse);
    if (at === null) return null;
    const c = deps.compensation();
    return at + c.outputMs + c.calibrationMs + (options.settleMs ?? 0);
  };

  const onBeat = (click: Click) => {
    // Score each bar whose last stroke is in, and step the fade for the bars to come.
    while (scoring < options.bars - 1) {
      const strokes = strokesOf(scoring);
      const last = strokes.at(-1);
      const due = last === undefined ? null : dueAfter(last);
      if (due === null || click.at < due) break;
      const targets = strokes.map((p) => metronome.timeAtPulse(p) ?? 0);
      rung = fadeStep(rung, options.ladder.length, options.rateBar(scoring, targets, onsets));
      scoring += 1;
    }
    if (click.pulse < end) return;
    const last = options.pulses.at(-1);
    const due = last === undefined ? click.at : dueAfter(last);
    if (due !== null && click.at >= due) finish(true);
  };

  unsubscribe.push(
    withLatency(source, deps.compensation, (o) => onsets.push({ at: o.at, strength: o.strength })),
    source.onStateChange((state) => {
      // A failed start rejects instead (below); this is an input lost mid-run.
      if (state === 'error' && listening) finish(false);
    }),
  );

  void source
    .start()
    .then(async () => {
      listening = true;
      if (finished) return;
      const started = await metronome.start({
        meter: options.meter,
        bpm: options.bpm,
        subdivide: options.stepsPerPulse,
        countInBars: options.countInBars,
        fade: audible,
      });
      if (!started) return finish(false);
      // Only now: starting the shared metronome stops (and so reports) any run before ours.
      if (!finished)
        unsubscribe.push(
          metronome.onBeat(onBeat),
          metronome.onStop(() => finish(false)),
        );
    })
    .catch((err: unknown) => {
      if (finished) return;
      stop();
      fail(err);
    });

  return { done, cancel: () => finish(false) };
}
