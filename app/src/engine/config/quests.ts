export const quests = {
  /** Quests drawn per local date (design §3.7 daily quests). */
  perDay: 3,
  /**
   * Weak-area quests judge strings and skills by the reviews of this many
   * days before the quest's date. Only earlier days count, so a day's draw
   * never changes while it is being played.
   */
  lookbackDays: 14,
  /** A string or skill needs this many unguided answers in the lookback to be judged. */
  minAreaAnswers: 10,
  /**
   * Each quest's target and bonus XP. A bonus is worth at most two fluent
   * due answers (12 XP each), so the practice itself earns the bulk, and no
   * quest counts answers to not-due cards, so none ever pays for drilling
   * stable cards early.
   */
  'clear-due': { target: 1, bonusXp: 20 },
  'new-ground': { target: 3, bonusXp: 20 },
  fluent: { target: 5, bonusXp: 15 },
  'fix-slips': { target: 2, bonusXp: 15 },
  'mix-it-up': { target: 3, bonusXp: 20 },
  'weak-strings': { target: 10, bonusXp: 20 },
  'weak-skill': { target: 8, bonusXp: 20 },
} as const;

declare module './index' {
  interface EngineConfig {
    quests: typeof quests;
  }
}
