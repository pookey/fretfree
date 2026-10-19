export const progressionBuilder = {
  /**
   * D12's keys by adaptive-scope level (research/02 rule 5): the open-chord
   * keys first, then the flat keys a band meets, then the rest. Each level
   * adds to the one before. Keys are written as `theory/harmony` labels.
   */
  keysByScope: {
    major: [
      ['C', 'G', 'D', 'A', 'E'],
      ['F', 'Bb', 'Eb'],
      ['B', 'Ab', 'Db', 'F#'],
    ],
    minor: [
      ['Am', 'Em', 'Dm'],
      ['Bm', 'Gm', 'Cm', 'F#m'],
      ['C#m', 'Fm', 'G#m', 'Bbm'],
    ],
  },
  /**
   * Distractor tiles beside the progression's own chords, by scope level.
   * The last level offers every chord the palette has (the whole key).
   */
  distractorsByScope: [2, 4, 7],
} as const;

declare module './index' {
  interface EngineConfig {
    progressionBuilder: typeof progressionBuilder;
  }
}
