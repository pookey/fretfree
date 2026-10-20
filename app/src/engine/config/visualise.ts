export const visualise = {
  /**
   * D21 shows "Found 1 of 2" only at this guide level and above (rule 9): the
   * total says how many roots the pictured shape has, which is part of the recall.
   */
  countGuideLevel: 2,
  /**
   * Compact screens show at least this many frets from just below the shape's
   * position, so every shape at that position fits (the widest spans 5 frets).
   */
  compactWindowFrets: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    visualise: typeof visualise;
  }
}
