export const garage = {
  /**
   * Garage prices in XP, by catalogue item ID (design §3.8). The starter parts
   * cost 0, so they are owned from day one. An item without a price here is
   * never for sale: it is unlocked by its `unlockedBy` badge instead.
   */
  prices: {
    'body.stratocaster': 0,
    'finish.red': 0,
    'pickguard.white': 0,
    'hardware.chrome': 0,
    'board.rosewood': 0,
    'inlay.dots': 0,
  } as Readonly<Record<string, number>>,
  /**
   * What the price reachability test checks (design §3.8 guardrails). Daily
   * XP at a goal is `goalMinutes × answersPerMinute × XP per answer`, the
   * last derived from `gamification.xp`.
   */
  reachability: {
    /** The Casual and Regular daily goals, in minutes (design §3.7). */
    casualMinutes: 5,
    regularMinutes: 10,
    /**
     * Assumed graded answers per minute of practice: a prompt, an answer and
     * its feedback take about 7 to 8 seconds.
     */
    answersPerMinute: 8,
    /** The cheapest non-starter part is affordable after this many Casual days. */
    cheapestCasualDays: 1,
    /** The priciest part needs no more than this many Regular days. */
    priciestRegularDays: 14,
  },
} as const;

declare module './index' {
  interface EngineConfig {
    garage: typeof garage;
  }
}
