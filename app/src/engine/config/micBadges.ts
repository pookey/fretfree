export const micBadges = {
  /**
   * Mic badges: among the recent reviews (`gamification.achievements
   * .recentReviews`), at least `minAnswers` unguided answers from the drill
   * at `minAccuracy` or better. A competence threshold over a sample, not an
   * activity count, so playing a lot of wrong notes never earns one.
   */
  minAnswers: 10,
  minAccuracy: 0.9,
} as const;

declare module './index' {
  interface EngineConfig {
    micBadges: typeof micBadges;
  }
}
