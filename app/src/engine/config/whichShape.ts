export const whichShape = {
  /**
   * D10's mix of questions, as relative weights: "which shape is this?",
   * "which comes next up the neck?" and "which comes before, down the neck?".
   * Naming the shape recalls the card's own template, so it outweighs both
   * chain questions together. A chain rep is graded on the answer shape's
   * card (the template grain, design §3.1) though it recalls the chain more
   * than the shape; a chain item kind of its own is a later engine change.
   */
  askWeights: { name: 3, next: 1, previous: 1 },
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
