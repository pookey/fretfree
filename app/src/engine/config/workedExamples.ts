export const workedExamples = {
  /**
   * Guide level of the neck at each stage of a worked example (research/02
   * rule 8, design §3.5): labels and the answer when worked, roots only with a
   * hint when faded, inlays only when the learner works it out alone.
   */
  stageGuideLevels: { worked: 3, faded: 2, independent: 1 },
  /**
   * A step's neck window starts this many frets below its given note and
   * spans `span` frets, so the window depends on the stimulus, never on
   * where the answer is. Examples without a given note pin their own window.
   */
  lead: 2,
  span: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    workedExamples: typeof workedExamples;
  }
}
