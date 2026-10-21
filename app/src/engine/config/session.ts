export const session = {
  /** Rough time per item, used to turn a time budget into an item count. */
  secondsPerItem: 7,
  /** Due reviews take at most this share of a session. */
  reviewShare: 0.7,
  /** New items are introduced in blocked groups of this size (3–5). */
  newBlockSize: 4,
  /** After its worked example, each new item gets this many reps (3–5), fading to independent. */
  newBlockReps: 3,
  /** A wrong answer is retried this many items later. */
  retryGap: 3,
  /**
   * New items one session introduces at most, for a `newCapMinutes` session,
   * scaled by its minutes (research/02 rule 11: short sessions, no cramming).
   */
  maxNewPerSession: 8,
  newCapMinutes: 10,
  /** While recent accuracy is above the adaptive band's top, the cap rises by this share. */
  newCapRaise: 0.5,
  /**
   * Shares of the new items: the goal's modules, the neck, and the parallel
   * tracks (Ear, Rhythm), split between those open (design §5, `frontierLanes`).
   */
  lanes: { goal: 2, neck: 1, parallel: 1 },
} as const;

declare module './index' {
  interface EngineConfig {
    session: typeof session;
  }
}
