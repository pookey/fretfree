export const nameChord = {
  /**
   * The share of D36 prompts drawn as a chord diagram (design §8 chart view)
   * rather than on the neck. Reading both is the skill (research/02 rule 12).
   */
  diagramShare: 0.5,
  /**
   * The answer is two choices, the root then the quality, so D36 grades the
   * time per choice and the usual speed targets apply (design §3.2).
   */
  answerParts: 2,
  /**
   * Compact screens show at least this many frets round the voicing. Every
   * D36 voicing spans at most four frets in standard tuning.
   */
  compactWindowFrets: 5,
} as const;

declare module './index' {
  interface EngineConfig {
    nameChord: typeof nameChord;
  }
}
