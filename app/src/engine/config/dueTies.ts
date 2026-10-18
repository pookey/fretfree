/** Ordering due reviews that are about equally overdue (design §3.3 step 1, research/02 rule 6). */
export const dueTies = {
  /**
   * Due reviews within this much retrievability of the most overdue card in
   * their run count as tied. A tied run is mixed across skills instead of
   * served in item-ID order, so a placement-seeded batch interleaves. Outside
   * the window, the more overdue card still comes first. Retrievability moves
   * in whole days, about 0.002–0.007 a day for typical stabilities, so this
   * ties cards a day or two apart and leaves a clearly more overdue one first.
   */
  window: 0.01,
} as const;

declare module './index' {
  interface EngineConfig {
    dueTies: typeof dueTies;
  }
}
