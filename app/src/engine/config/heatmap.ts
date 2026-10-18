export const heatmap = {
  /**
   * Upper bounds (days) of the Progress heatmap's stability bands (design §7).
   * Four bounds give five bands; 7 matches `mastery.stabilityDays`.
   */
  stabilityBandsDays: [1, 7, 21, 90],
  /** A cell's median response time is taken over its latest N correct answers. */
  recentAnswers: 10,
  /** The retention forecast looks this many days ahead ("next week"). */
  forecastDays: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    heatmap: typeof heatmap;
  }
}
