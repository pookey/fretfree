/** The staff-interval drill: R5 intervallic reading (research/03 R5, design §12). */
export const staffIntervals = {
  /**
   * Reading cards' speed target over the learner's baseline, in ms: R5's
   * "name the interval in under 1.5 s", where the usual target is 2 s
   * (`grading.targetDeltaMs`). Placing cards keep the usual target.
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
