import type { ChordDegree, ChordKind } from '../../theory';

export const buildChord = {
  /**
   * D38 accepts a voicing whose fretted notes span at most this many frets,
   * counting both ends (frets 2–5 is 4). Open strings don't count: they
   * need no finger.
   */
  maxSpan: 4,
  /**
   * Fingers a voicing may need. Notes on the lowest fretted fret share one
   * finger (a barre) unless an open string rings between them.
   */
  maxFingers: 4,
  /**
   * Tones a voicing may leave out. Guitarists drop the 5th of a four-note
   * chord first: it adds nothing to the chord's quality. Every other tone,
   * and every tone of a triad or sus chord, must sound.
   */
  optionalDegrees: {
    '7': ['5'],
    maj7: ['5'],
    m7: ['5'],
    add9: ['5'],
  } as Partial<Record<ChordKind, readonly ChordDegree[]>>,
  /**
   * From this guide level the chord's formula shows (R ♭3 5 ♭7), and from
   * `noteGuideLevel` its notes too (A C E G). Below, it's recall (rule 9).
   */
  formulaGuideLevel: 2,
  noteGuideLevel: 3,
  /**
   * Compact screens show at least this many frets, centred on the root, so a
   * voicing reaching `maxSpan - 1` frets either side of it fits.
   */
  compactWindowFrets: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    buildChord: typeof buildChord;
  }
}
