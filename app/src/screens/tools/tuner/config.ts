/**
 * Every tuner tunable (design §7 Tools). Change values here, not inline. The
 * tuner grades nothing, so these live with it rather than in `engine/config`,
 * and load only with its lazy view.
 */
export const TUNER_CONFIG = {
  /** A note within this many cents of its target reads as in tune. */
  inTuneCents: 5,
  /** The needle shows the median of the voiced frames from this long ago up to now, in ms. */
  smoothingMs: 120,
  /** After this long without a voiced frame (ms), the reading clears. */
  holdMs: 1500,
  /**
   * A frame this many cents from the reading is a new note only once a second
   * frame agrees with it, so a single octave glitch never flicks the display.
   */
  jumpCents: 50,
  /** The needle's swing either side of centre, in degrees, at ±50 cents. */
  needleMaxDeg: 60,
  referenceTone: {
    /** How long a reference tone is held, in seconds. */
    durationS: 2.5,
    /**
     * How long the tuner ignores the mic after a tone starts, in ms: the tone
     * plus the synth's 0.8s release. Echo cancellation is off (MIC_CONSTRAINTS),
     * so the mic would otherwise hear the tone as the learner's note.
     */
    muteMicMs: 3500,
  },
} as const;
