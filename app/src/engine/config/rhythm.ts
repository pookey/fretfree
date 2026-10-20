/**
 * The F4 rhythm track (D20 "Tap and strum rhythm"): its timing windows,
 * tempos and guides. The click and the grade are the timing engine's
 * (`timing.ts`, M8-01); these are D20's own settings for them.
 */
export const rhythm = {
  /**
   * D20's timing grade (`gradeTiming`), in the shape of design §3.2. The
   * ±30 ms target is F4's "tap within ±30ms of a click" (research/03):
   * inside it is Good, inside `fluentMs` Easy. A hit up to `onTimeMs` off
   * still counts but is loose (Hard), so the grade keeps all four ratings
   * (research/02 rule 2); past it, the hit is wrong.
   */
  grade: {
    onTimeMs: 50,
    passRate: 0.8,
    targetMs: 30,
    fluentMs: 15,
    matchMs: 150,
  },
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
