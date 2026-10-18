export const workedExamples = {
  /**
   * Guide level of the neck at each stage of a worked example (research/02
   * rule 8, design §3.5): labels and the answer when worked, roots only with a
   * hint when faded, inlays only when the learner works it out alone.
   */
  stageGuideLevels: { worked: 3, faded: 2, independent: 1 },
  /** Frets of context shown either side of a step's notes. */
  rangePadding: 1,
  /** The fewest frets a step's neck shows, so it keeps some landmarks around it. */
  minFrets: 5,
} as const;

declare module './index' {
  interface EngineConfig {
    workedExamples: typeof workedExamples;
  }
}
