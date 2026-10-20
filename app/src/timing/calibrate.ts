/**
 * The tap-to-click calibration run (design §12): a bar of count-in, then
 * ~10s of steady clicks to tap (or strum) along with. Onsets have only the
 * output latency taken off; what is left over is the learner's offset for
 * that input, which `summariseCalibration` measures. The caller saves it.
 */
import { ENGINE_CONFIG } from '../engine/config';
import { summariseCalibration, type CalibrationConfig, type CalibrationResult } from './latency';
import { METER_PRESETS } from './meter';
import type { Click, Metronome } from './metronome';
import type { OnsetSource } from './onsets';

export interface CalibrationDeps {
  metronome: Metronome;
  source: OnsetSource;
  /** The output latency now, in ms (`currentOutputLatencyMs`). */
  outputLatencyMs: () => number;
}

export interface CalibrationProgress {
  /** Clicks to tap along with so far, count-in excluded. */
  clicks: number;
  total: number;
  /** Onsets heard so far, count-in included. */
  onsets: number;
}

export interface CalibrationRun {
  /** The result; `null` if cancelled, interrupted, or audio or the input wouldn't start. */
  readonly done: Promise<CalibrationResult | null>;
  cancel(): void;
  onProgress(listener: (progress: CalibrationProgress) => void): () => void;
}

/**
 * Starts the input, then the click. Call it from the learner's tap: both the
 * mic and audio unlock only inside a gesture. Rejects only if the input fails
 * to start (with its `OnsetSourceError`), or the metronome options are invalid.
 */
export function runCalibration(
  deps: CalibrationDeps,
  cfg: CalibrationConfig = ENGINE_CONFIG.timing.calibration,
): CalibrationRun {
  const { metronome, source } = deps;
  const clicks: number[] = [];
  const onsets: number[] = [];
  const progress = new Set<(p: CalibrationProgress) => void>();
  const report = () => {
    const p = { clicks: clicks.length, total: cfg.clicks, onsets: onsets.length };
    progress.forEach((l) => l(p));
  };
  let settle!: (result: CalibrationResult | null) => void;
  let fail!: (err: unknown) => void;
  const done = new Promise<CalibrationResult | null>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  let finished = false;
  /** The input started; from then on, losing it ends the run. */
  let listening = false;
  const unsubscribe: (() => void)[] = [];
  const finish = (result: CalibrationResult | null) => {
    if (finished) return;
    finished = true;
    unsubscribe.splice(0).forEach((u) => u());
    metronome.stop();
    source.stop();
    settle(result);
  };

  unsubscribe.push(
    source.onOnset((o) => {
      onsets.push(o.at - deps.outputLatencyMs());
      report();
    }),
    source.onStateChange((state) => {
      // A failed start rejects instead (below); this is an input lost mid-run.
      if (state === 'error' && listening) finish(null);
    }),
  );
  const onClick = (click: Click) => {
    if (click.countIn) return;
    // The first click past the run: every tap for the last one is in by now.
    if (click.pulse >= cfg.clicks) {
      finish(summariseCalibration(clicks, onsets, cfg));
      return;
    }
    clicks.push(click.at);
    report();
  };

  // The input first, from the tap itself; then the click.
  void source
    .start()
    .then(async () => {
      listening = true;
      if (finished) return;
      const started = await metronome.start({
        meter: METER_PRESETS['4/4'],
        bpm: cfg.bpm,
        countInBars: 1,
        // Silent past the run: the click that ends it isn't heard.
        fade: (c) => c.pulse < cfg.clicks,
      });
      if (!started) return finish(null);
      // Only now: starting the shared metronome stops (and so reports) any run before ours.
      // The Transport's first click comes from its own timer, after this.
      if (!finished)
        unsubscribe.push(
          metronome.onClick(onClick),
          metronome.onStop(() => finish(null)),
        );
    })
    .catch((err: unknown) => {
      if (finished) return;
      finished = true;
      unsubscribe.splice(0).forEach((u) => u());
      source.stop();
      fail(err);
    });

  return {
    done,
    cancel: () => finish(null),
    onProgress(listener) {
      progress.add(listener);
      return () => progress.delete(listener);
    },
  };
}
