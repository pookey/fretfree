import type { TimingWindow } from '../model';

/**
 * The F4 rhythm track (D20 "Tap and strum rhythm"): its timing windows,
 * tempos and guides. The click and the grade are the timing engine's
 * (`timing.ts`, M8-01); these are D20's own settings for them.
 */
export const rhythm = {
  /**
   * D20's timing grade (`gradeTiming`), in the shape of design §3.2: the
   * parts every timing window shares. A hit further than `matchMs` from every
   * click is a stray, not a late one.
   */
  grade: {
    passRate: 0.8,
    matchMs: 150,
  },
  /**
   * The learner's timing window (`settings.timingWindow`). Strict is F4's
   * "tap within ±30ms of a click" (research/03): within `targetMs` is Good,
   * within `fluentMs` Easy, and a hit up to `onTimeMs` off still counts but
   * is loose (Hard), so the grade keeps all four ratings (research/02 rule
   * 2); past it, the hit is wrong. A touchscreen adds jitter a guitar
   * doesn't, so the wider windows are for learners who fail on time they
   * can hear is right. Every `onTimeMs` stays under `grade.matchMs` and half
   * an eighth at the top tempo.
   */
  windows: {
    strict: { onTimeMs: 50, targetMs: 30, fluentMs: 15 },
    standard: { onTimeMs: 80, targetMs: 45, fluentMs: 25 },
    relaxed: { onTimeMs: 120, targetMs: 70, fluentMs: 40 },
  } satisfies Record<TimingWindow, { onTimeMs: number; targetMs: number; fluentMs: number }>,
  /**
   * Adaptive scope (research/02 rule 5): the tempo band, in BPM, per scope
   * level. A prompt picks its tempo from the band (rule 12: the same rhythm
   * at many tempos). The top stays slow enough that half a beat is longer
   * than `grade.matchMs`, so an off-beat hit is never taken for a late one.
   */
  tempoBands: [
    [60, 72],
    [72, 88],
    [88, 104],
    [104, 120],
  ],
  /** Tempos within a band are multiples of this many BPM. */
  tempoStep: 2,
  /**
   * A rep ends this long after its last hit's onset window (`grade.matchMs`,
   * past the output latency and the learner's offset) has closed, so a mic
   * onset still being detected isn't cut off.
   */
  endMarginMs: 50,
  /** A right answer's hit-by-hit marks stay this long before the session moves on. */
  feedbackHoldMs: 2500,
  /** Bars of count-in, then bars of the rhythm to play. */
  countInBars: 1,
  bars: 2,
  /** At and above this guide level a light steps along the rhythm as it plays (rule 9). */
  playheadGuideLevel: 2,
  /** At and above this guide level the click sounds every "&" of a rhythm that has off-beats. */
  subdivideGuideLevel: 2,
  /** At and above this guide level the counts ("1 & 2 &") are shown under the rhythm. */
  countGuideLevel: 1,
} as const;

declare module './index' {
  interface EngineConfig {
    rhythm: typeof rhythm;
  }
}
