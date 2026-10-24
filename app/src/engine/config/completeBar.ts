export const completeBar = {
  /**
   * D29 plays a bar on the click when the learner asks: a bar of the meter's
   * beats to count in, then each note of the bar as a click (design §12
   * "sound before symbol", research/02 rule 10). This many felt beats a
   * minute, slow enough to hear a sixteenth.
   */
  feltBeatsPerMinute: 66,
} as const;

declare module './index' {
  interface EngineConfig {
    completeBar: typeof completeBar;
  }
}
