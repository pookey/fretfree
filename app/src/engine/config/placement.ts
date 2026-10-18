/** The onboarding placement test (design §3.4, §4 step 6). */
export const placement = {
  /**
   * Topics the test probes, in curriculum order. A topic whose skills or
   * drills don't exist yet simply has nothing to probe until they land.
   */
  topics: ['F1', 'F2', 'C2', 'C3', 'C5', 'C8'],
  /** No new probe starts after this long: the test takes about 3 minutes. */
  budgetMs: 180_000,
  /**
   * Probes per skill, by the skill's item count: the first tier whose `upTo`
   * covers it applies, and the last covers anything larger. A skill is known
   * once `knownAt` probes are fluent (correct within the speed target), and
   * not known once that can no longer happen.
   */
  tiers: [
    { upTo: 8, probes: 3, knownAt: 3 },
    { upTo: 40, probes: 4, knownAt: 3 },
    { upTo: Number.MAX_SAFE_INTEGER, probes: 6, knownAt: 5 },
  ],
  /**
   * The guide level a known skill starts at: inlays only. Full guides help
   * novices and hold experts back (expertise reversal, research/02).
   */
  knownGuideLevel: 1,
} as const;

declare module './index' {
  interface EngineConfig {
    placement: typeof placement;
  }
}
