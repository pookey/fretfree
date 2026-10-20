export const triadInversions = {
  /**
   * D18's context panel lists each inversion's degrees, low string first
   * ("1st inversion: 3 5 R"), at this guide level and above, and after an
   * answer (rule 9: the formula fades with the guides).
   */
  formulaGuideLevel: 2,
  /**
   * Compact screens show at least this many frets, centred on the root, so
   * every inversion reaching up to 3 frets either side fits and the window
   * never shows which way the shape lies from the root.
   */
  compactWindowFrets: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    triadInversions: typeof triadInversions;
  }
}
