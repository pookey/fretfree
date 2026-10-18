/**
 * Every tunable threshold of the learning engine lives here (design §3.2 and
 * research/02 rules 2, 3, 5, 6, 7). Change values here, not inline.
 */
export const ENGINE_CONFIG = {
  grading: {
    /** Correct answers slower than baseline + targetDeltaMs are graded Hard. */
    targetDeltaMs: 2000,
    /** Correct answers at or under baseline + fluentDeltaMs are graded Easy. */
    fluentDeltaMs: 1000,
    /** Used until the onboarding latency calibration has run. */
    defaultBaselineMs: 700,
  },
  fsrs: {
    requestRetention: 0.9,
    maximumIntervalDays: 365,
    /** Placement-test "already known" items are seeded at this stability. */
    seededStabilityDays: 10,
  },
  session: {
    /** Rough time per item, used to turn a time budget into an item count. */
    secondsPerItem: 7,
    /** Due reviews take at most this share of a session. */
    reviewShare: 0.7,
    /** New items are introduced in blocked groups of this size (3–5). */
    newBlockSize: 4,
    /** Each new item gets this many guided reps before interleaving. */
    newBlockReps: 3,
    /** A wrong answer is retried this many items later. */
    retryGap: 3,
  },
  adaptive: {
    window: 20,
    /** Decisions need at least this many answers in the window. */
    minAnswers: 10,
    widenAbove: 0.92,
    narrowBelow: 0.75,
  },
  mastery: {
    stabilityDays: 7,
    itemShare: 0.9,
    /** Median response time is taken over the most recent N reviews of the skill. */
    recentReviews: 30,
  },
  guides: {
    maxLevel: 3,
    /** Fade one level when rolling accuracy is at least this and speed is on target. */
    fadeAtAccuracy: 0.9,
    /** Restore one level when rolling accuracy falls below this. */
    restoreBelowAccuracy: 0.7,
  },
  gamification: {
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
       * recent reviews is under `medianMs`. `minAnswers` unguided answers at
       * `minAccuracy` or better keep it a fluency signal, not luck or guessing.
       */
      speedDemon: { medianMs: 1200, minAnswers: 30, minAccuracy: 0.9 },
    },
    /** Daily-goal minutes (design §3.7 engine wiring). */
    daily: {
      /**
       * Session time counts toward the daily goal answer by answer. A gap
       * longer than this (the learner walked away) counts only up to it.
       */
      maxGapSeconds: 60,
    },
  },
  heatmap: {
    /**
     * Upper bounds (days) of the Progress heatmap's stability bands (design §7).
     * Four bounds give five bands; 7 matches `mastery.stabilityDays`.
     */
    stabilityBandsDays: [1, 7, 21, 90],
    /** A cell's median response time is taken over its latest N correct answers. */
    recentAnswers: 10,
    /** The retention forecast looks this many days ahead ("next week"). */
    forecastDays: 7,
  },
} as const;

export type EngineConfig = typeof ENGINE_CONFIG;
