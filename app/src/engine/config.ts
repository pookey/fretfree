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
} as const;

export type EngineConfig = typeof ENGINE_CONFIG;
