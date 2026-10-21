export const startWithSound = {
  /** The ear track's topics (design §5 "Ear (parallel track)"). */
  topics: ['I6'],
  /**
   * The neck skills that hold the ear track's first sets back so a first
   * session stays the neck's (`skills/i6.ts` DAY_ONE, `skills/i6-ear-find.ts`).
   * "Start with sound" treats them as met for ear skills only. Gates that
   * teach something an ear skill needs (C9's numerals for progression ear)
   * are not listed, so they still hold (research/02 rule 7).
   */
  openPrerequisites: ['F1.alphabet', 'F2.string6-naturals'],
  /** Ear → fretboard first (design §4, research/02 rule 13): these lead the path, in order. */
  leading: ['I6.ear-find'],
} as const;

declare module './index' {
  interface EngineConfig {
    startWithSound: typeof startWithSound;
  }
}
