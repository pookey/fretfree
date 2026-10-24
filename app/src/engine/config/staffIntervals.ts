/** The staff-interval drill: R5 intervallic reading (research/03 R5, design §12). */
export const staffIntervals = {
  /**
   * Reading cards' speed target over the learner's baseline, in ms: R5's
   * "name the interval in under 1.5 s", where the usual target is 2 s
   * (`grading.targetDeltaMs`). Placing cards keep the usual target.
   *
   * The drill adds the difference (500 ms) to a reading card's graded and
   * logged time, as there is no per-drill speed-target hook yet. That
   * moves the Easy band too: Easy needs baseline + 0.5 s, not + 1 s
   * (`grading.fluentDeltaMs`), and mastery and guide fading read the same
   * times. This is stricter than research/03 asks, which sets only the
   * 1.5 s target, and is accepted until a hook can set R5's targets directly.
   */
  targetDeltaMs: 1500,
  /**
   * Notes in a read-ahead phrase (scope level 1 and up): the pair to name
   * sits among neighbours, as it does in music.
   */
  phraseLength: 4,
  /** The widest leap, in staff steps, between a phrase's other notes. */
  phraseMaxLeap: 4,
} as const;

declare module './index' {
  interface EngineConfig {
    staffIntervals: typeof staffIntervals;
  }
}
