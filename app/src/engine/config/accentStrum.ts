/**
 * D31 "Accent and strum in meter" (T3, T5): its tempos, bars, guides and how
 * it hears an accent. The click, the fade ladder and the grade are the timing
 * engine's (`timing.ts`, M8-01); the timing windows are the learner's
 * rhythm setting (`rhythm.ts` `windows`), shared with D20.
 */
export const accentStrum = {
  /**
   * Adaptive scope (research/02 rule 5): the tempo band per scope level, in
   * quarter notes a minute. A meter in eighths (6/8, 7/8) clicks its eighths
   * at twice this. A prompt picks its tempo from the band (rule 12).
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
   * The fastest a bar asks for strokes, per minute: sixteenths and 12/8 slow
   * down to it. Its gap (240 ms) leaves half a stroke at least as wide as
   * the relaxed on-time window, so a loose stroke is never taken for the
   * next one's.
   */
  maxStrokesPerMinute: 250,
  /** Bars of count-in, then bars to play: enough for the click to fade within a rep. */
  countInBars: 1,
  bars: 4,
  /**
   * The rung of the click's fade ladder (`timing/fade.ts`) a rep starts on,
   * by guide level 0–3 (rule 9: guidance fades across sessions). Within the
   * rep it climbs or falls bar by bar with the taps' accuracy
   * (`timing.fade`). The worked example starts with the full click.
   */
  startRung: [3, 2, 1, 0],
  /** At and above this guide level the count ("1 e & a", "1 la li") is shown under the bar. */
  syllableGuideLevel: 2,
  /** At and above this guide level a light steps along the bar as it plays. */
  playheadGuideLevel: 2,
  accents: {
    /** A tap on the soft pad has this strength; the accent pad's is 1. */
    softTapStrength: 0.5,
    /** A tap at or above this strength is an accent. */
    tapAccentMin: 0.75,
    /**
     * A strum is heard as accented when it stands out from the take's other
     * strums: the loudest must be at least this many times the quietest, and
     * an accent is then louder than their geometric mean. Strummed all alike,
     * nothing is accented.
     */
    micContrast: 1.6,
  },
  /**
   * A rep ends this long after its last stroke's onset window has closed, so
   * a mic onset still being detected isn't cut off.
   */
  endMarginMs: 50,
  /** A right answer's stroke-by-stroke marks stay this long before the session moves on. */
  feedbackHoldMs: 3000,
} as const;

declare module './index' {
  interface EngineConfig {
    accentStrum: typeof accentStrum;
  }
}
