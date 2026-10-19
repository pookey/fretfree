export const whichShape = {
  /**
   * D10's mix of questions, as relative weights: "which shape is this?",
   * "which comes next up the neck?" and "which comes before, down the neck?".
   * Naming the shape is the core recall; the chain questions link each shape
   * to its neighbours (research/03 C6).
   */
  askWeights: { name: 3, next: 2, previous: 1 },
  /**
   * From this guide level the shape's notes show their degrees, by shape and
   * colour (rule 9). Below it the roots are squares and the rest plain dots.
   */
  degreeGuideLevel: 2,
  /** Compact screens show at least this many frets, so a shape and its neighbour fit. */
  compactWindowFrets: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    whichShape: typeof whichShape;
  }
}
