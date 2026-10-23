export const garage = {
  /**
   * Garage prices in XP, by catalogue item ID (design §3.8). The starter parts
   * cost 0, so they are owned from day one. An item without a price here is
   * never for sale: it is unlocked by its `unlockedBy` badge instead.
   *
   * The cheapest part is within one Casual day and the priciest within two
   * Regular weeks (`reachability`, tested in `garage/catalogue.test.ts`).
   */
  prices: {
    'body.stratocaster': 0,
    'body.telecaster': 2000,
    'body.les-paul': 4000,
    'body.sg': 3000,
    'body.jazzmaster': 3500,
    'body.es-335': 6000,
    'body.superstrat': 4500,
    'body.dreadnought': 5000,
    'body.jumbo': 7500,
    'body.parlour': 3500,
    'body.concert': 5500,
    'body.classical': 5000,

    'finish.red': 0,
    'finish.black': 300,
    'finish.white': 300,
    'finish.blue': 350,
    'finish.seafoam': 400,
    'finish.three-tone-sunburst': 900,
    'finish.cherry-sunburst': 1000,
    'finish.tobacco-burst': 1000,
    'finish.natural-ash': 800,
    'finish.butterscotch': 900,
    'finish.mahogany': 900,
    'finish.walnut': 1000,
    'finish.silver-metallic': 1500,
    'finish.gold-top': 1800,
    'finish.candy-red': 2000,
    'finish.silver-sparkle': 2500,
    'finish.purple-sparkle': 2800,

    'pickguard.white': 0,
    'pickguard.none': 250,
    'pickguard.black': 250,
    'pickguard.cream': 300,
    'pickguard.mint': 350,
    'pickguard.tortoiseshell': 450,

    'hardware.chrome': 0,
    'hardware.black': 400,
    'hardware.gold': 600,

    'board.rosewood': 0,
    'board.maple': 700,
    'board.ebony': 900,

    'inlay.dots': 0,
    'inlay.blocks': 500,
    'inlay.trapezoids': 600,
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
    /**
     * Assumed share of correct answers: the middle of the adaptive 80–90%
     * band (design §3.3 step 4). Correct answers are rated Good, so no
     * fluency bonus is counted.
     */
    accuracy: 0.85,
    /**
     * Assumed share of answers that repeat an item already answered today
     * (learning steps and retries bring items back within a session). Each is
     * priced as a second answer, at `gamification.xp.repeatDecay`; the rest
     * are first answers today to a due or new card.
     */
    repeatShare: 0.3,
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
