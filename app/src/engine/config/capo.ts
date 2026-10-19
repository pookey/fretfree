/** D13 "Capo calculator" (C10, design §6 D13). */
export const capo = {
  /**
   * The highest capo fret a prompt uses at each scope level. Beyond about
   * fret 7 players change shapes rather than climb further (`capoOptions`
   * stops at 7 too), so the top level stays there.
   */
  maxCapoByLevel: [4, 7, 7],
  /**
   * Answer buttons at each scope level (research/02 rule 5, distractors).
   * The first ones are always the answer, the wrong-direction answer and the
   * capo-ignored answer (research/03 C10 misconceptions); `null` offers all
   * twelve keys, or frets 1–11.
   */
  choicesByLevel: [4, 6, null],
} as const;

declare module './index' {
  interface EngineConfig {
    capo: typeof capo;
  }
}
