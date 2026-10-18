/** Per-user FSRS parameter refit (research/02 rule 1, engine/refit.ts). */
export const refit = {
  /** No refit before this many logged reviews: the defaults are used unchanged. */
  minReviews: 1000,
  /** Refit again once this many reviews have been logged since the last fit. */
  refitEveryReviews: 1000,
  /**
   * Reviews on a later day than the item's previous review. Only those test
   * the forgetting curve, so fewer than this and the fit is skipped.
   */
  minCrossDayReviews: 100,
  /** Adam steps over the whole log. */
  iterations: 80,
  /** Adam step size, as a fraction of each parameter's allowed range. */
  learningRate: 0.02,
  /**
   * L2 pull towards the FSRS defaults (per parameter, range-normalised),
   * divided by the number of cross-day reviews: strong on a small log, weak
   * on a large one.
   */
  priorStrength: 50,
  /** Keep the fit only if it beats the defaults' log loss by at least this much. */
  minImprovement: 1e-4,
} as const;

declare module './index' {
  interface EngineConfig {
    refit: typeof refit;
  }
}
