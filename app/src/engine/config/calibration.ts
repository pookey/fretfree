/** The onboarding "tap the lit dot" run that sets the latency baseline (design §4 step 5). */
export const calibration = {
  /** Lit dots per run: with the pauses between them, about 20 seconds. */
  trials: 16,
  /** The first taps are practice and aren't counted. */
  warmupTrials: 2,
  /** A random pause before each dot lights, so taps can't be timed in advance. */
  foreperiodMs: { min: 400, max: 1000 },
  /** Taps faster than `min` are anticipations; slower than `max` are lapses. */
  validMs: { min: 150, max: 2500 },
  /** Tukey fences: taps more than this many IQRs outside the quartiles are trimmed. */
  outlierIqr: 1.5,
  /** A run needs at least this many usable taps to set the baseline. */
  minSamples: 8,
} as const;

declare module './index' {
  interface EngineConfig {
    calibration: typeof calibration;
  }
}
