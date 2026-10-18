export const buildCaged = {
  /**
   * D9 shows "Found 2 of 5" only at this guide level and above (rule 9): the
   * total says how many notes the shape has, which is part of the recall.
   */
  countGuideLevel: 2,
  /**
   * Compact screens show at least this many frets, centred on the root, so
   * shapes reaching 3 frets either side fit and the window never shows
   * which way the shape faces (the C vs A cue).
   */
  compactWindowFrets: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    buildCaged: typeof buildCaged;
  }
}
