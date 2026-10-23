/** The onboarding placement test (design §3.4, §4 step 6). */
export const placement = {
  /**
   * Topics the test probes, in curriculum order. A topic whose skills or
   * drills don't exist yet simply has nothing to probe until they land.
   * C4 (keys) is here because Chords needs both Intervals and Keys mastered.
   * C1 probes its octave shapes and C6 its triad cores (M10-16): the first
   * skill of each, so an experienced player doesn't meet them as new items.
   */
  topics: ['F1', 'F2', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C8'],
  // A skill of those topics that the test leaves out sets `skipPlacement`
  // in its own file (engine/model.ts `Skill`).
  /** No new probe starts after this long: the test takes about 3 minutes. */
  budgetMs: 180_000,
  /**
   * Probes per skill, by the skill's item count: the first tier whose `upTo`
   * covers it applies, and the last covers anything larger. A skill is known
   * once `knownAt` probes are fluent (correct within the speed target), and
   * not known once that can no longer happen.
   *
   * Breadth over depth, to fit the budget: every probed skill settles in a
   * few answers, and a large skill asks no more than a mid-sized one (it
   * asked 6, 5 to pass, until C1 and C6 joined in M10-16). A known skill is
   * only seeded at ≈10 days, so FSRS soon corrects a lucky pass, and the
   * stricter test-out below is what marks a skill mastered.
   *
   * A skill of five items or fewer asks one probe (F1's B–C and E–F, C6's
   * triad cores): it still samples a fifth of the skill, as the large tier
   * does at 15 items, and it frees the time the stage probes below take.
   */
  tiers: [
    { upTo: 5, probes: 1, knownAt: 1 },
    { upTo: 8, probes: 2, knownAt: 2 },
    { upTo: Number.MAX_SAFE_INTEGER, probes: 4, knownAt: 3 },
  ],
  /**
   * Staged topics (M10-20). Placement probes only some of their stages (C2:
   * string 2's naturals and the last sharps-and-flats stage; C8: the first
   * keys), and a known later stage doesn't imply the stages skipped before
   * it: a known string 2 says nothing about string 1. Each skipped earlier
   * stage gets one short probe once its later stage is known, after every
   * other probe: one answer, which must be fluent. A miss leaves the stage
   * as new cards; a pass only seeds it (at ≈10 days, not a gate), and FSRS
   * soon corrects a lucky one. C2 skips four stages: ~10 s for an expert,
   * inside `budgetMs` with the one-probe tier above.
   */
  stageProbes: {
    topics: ['C2', 'C8'],
    tier: { probes: 1, knownAt: 1 },
  },
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
