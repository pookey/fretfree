export const pentatonicBox = {
  /**
   * The pentatonic-box drill shows "Found 2 of 6" only at this guide level
   * and above (rule 9): the total says how many notes are left to place.
   */
  countGuideLevel: 2,
  /**
   * From this guide level the prompt names the CAGED shape a box wraps, or
   * the relative key (rule 9: the hint fades with the guides).
   */
  hintGuideLevel: 2,
  /**
   * Compact screens show at least this many frets around the box, so a box
   * with a stretch (five frets) fits with a fret either side.
   */
  compactWindowFrets: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    pentatonicBox: typeof pentatonicBox;
  }
}
