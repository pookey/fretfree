/** The onboarding placement test (design §3.4, §4 step 6). */
export const placement = {
  /**
   * Topics the test probes, in curriculum order. A topic whose skills or
   * drills don't exist yet simply has nothing to probe until they land.
   * C4 (keys) is here because Chords needs both Intervals and Keys mastered.
   */
  topics: ['F1', 'F2', 'C2', 'C3', 'C4', 'C5', 'C8'],
  // A skill of those topics that the test leaves out sets `skipPlacement`
  // in its own file (engine/model.ts `Skill`).
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
  /**
   * "Test out" of a locked module (M2-16): the same probe, scoped to the
   * prerequisites the module still needs. Passing marks a skill mastered,
   * so the bar is higher than the onboarding test's: more probes, and every
   * one must be fluent (rule 7 gates on mastery). One slip and the skill is
   * practised instead; nothing already earned goes back.
   */
  testOut: {
    tiers: [
      { upTo: 8, probes: 4, knownAt: 4 },
      { upTo: 40, probes: 6, knownAt: 6 },
      { upTo: Number.MAX_SAFE_INTEGER, probes: 8, knownAt: 8 },
    ],
    /** Scoped to a few skills, but each asks more: about 5 minutes at most. */
    budgetMs: 300_000,
  },
} as const;

declare module './index' {
  interface EngineConfig {
    placement: typeof placement;
  }
}
