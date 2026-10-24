/** The staff-interval drill: R5 intervallic reading (research/03 R5, design §12). */
export const staffIntervals = {
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
