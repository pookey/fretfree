export const gamification = {
  /**
   * XP per answer (design §3.7). Every answer earns `attempt`, a correct one
   * adds `correctBonus`, a fluent (Easy) one adds `fluentBonus` on top. The
   * sum is scaled by the card's kind, its stability when not due, and how
   * often it has already been answered today.
   */
  xp: {
    attempt: 6,
    correctBonus: 4,
    fluentBonus: 2,
    kindWeight: { new: 1, due: 1, stretch: 0.8, 'not-due': 0.4 },
    /** A not-due card's weight halves again once its stability reaches this. */
    stableHalfLifeDays: 7,
    /** Each earlier answer to the same item today multiplies XP by this. */
    repeatDecay: 0.5,
  },
  /** Achievement thresholds (design §3.7 achievements). */
  achievements: {
    /** How many of the latest reviews an achievement check looks at. */
    recentReviews: 50,
    /**
     * "Speed demon": the median of correct, unguided answers among the
     * recent reviews is under the learner's own tap time (the onboarding
     * latency baseline, or `grading.defaultBaselineMs` before calibration)
     * plus `marginMs`. Motor speed differs between people, so the bar is
     * recall time, not hand speed: 500 ms keeps the old 1.2 s for the default
     * 700 ms baseline. `minAnswers` unguided answers at `minAccuracy` or
     * better keep it a fluency signal, not luck or guessing.
     */
    speedDemon: { marginMs: 500, minAnswers: 30, minAccuracy: 0.9 },
  },
  /** Daily-goal minutes (design §3.7 engine wiring). */
  daily: {
    /**
     * Session time counts toward the daily goal answer by answer. A gap
     * longer than this (the learner walked away) counts only up to it.
     */
    maxGapSeconds: 60,
  },
  /** Session celebrations (design §3.7, §3.3 step 5). */
  celebrations: {
    /** The in-session combo counter shows from this many correct answers in a row. */
    comboShowAt: 3,
    /** "Perfect session" needs at least this many unguided answers, all correct. */
    perfectMinAnswers: 8,
    /** A session's median speed counts for a personal best only over this many correct unguided answers. */
    speedMinAnswers: 5,
    /**
     * An item counts as learned once its card has graduated to FSRS review
     * with at least this stability.
     */
    knownStabilityDays: 1,
    /**
     * A learned item counts as known ("you now know string 6 to fret 12")
     * only once its last successful review came at least this many local
     * days after it was introduced: recall across a gap, not cramming.
     */
    knownAfterGapDays: 1,
  },
} as const;

declare module './index' {
  interface EngineConfig {
    gamification: typeof gamification;
  }
}
