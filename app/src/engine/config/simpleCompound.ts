export const simpleCompound = {
  /**
   * D32 plays a card's meter on the click when the learner asks, so the
   * symbol is heard (design §12 "sound before symbol", research/02 rule 10):
   * this many felt beats a minute, a relaxed walk in any meter.
   */
  feltBeatsPerMinute: 72,
  /** Bars it plays: enough to hear the pattern repeat. */
  bars: 2,
} as const;

declare module './index' {
  interface EngineConfig {
    simpleCompound: typeof simpleCompound;
  }
}
