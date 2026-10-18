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
} as const;

declare module './index' {
  interface EngineConfig {
    session: typeof session;
  }
}
