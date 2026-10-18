export const confusions = {
  /** A learned confusion's weight halves over this many days without a repeat. */
  halfLifeDays: 14,
  /** The weight of a seed pair (E/F, B/C, …); one fresh wrong answer outweighs it. */
  seedWeight: 0.5,
  /** Learned confusions that have decayed below this weight are forgotten. */
  minLearnedWeight: 0.25,
  /** Pairing never pushes a due review more than this many slots later than its due order. */
  maxDelay: 2,
} as const;

declare module './index' {
  interface EngineConfig {
    confusions: typeof confusions;
  }
}
