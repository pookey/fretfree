export const mastery = {
  stabilityDays: 7,
  itemShare: 0.9,
  /** Median response time is taken over the most recent N reviews of the skill. */
  recentReviews: 30,
} as const;

declare module './index' {
  interface EngineConfig {
    mastery: typeof mastery;
  }
}
