/** Concept intros in a session (M10-04, `session/ConceptCard.tsx`). */
export const intros = {
  /**
   * A tap this soon after the card appears is ignored: it was aimed at the
   * prompt before, which auto-advanced under the learner's finger.
   */
  tapGuardMs: 400,
} as const;

declare module './index' {
  interface EngineConfig {
    intros: typeof intros;
  }
}
