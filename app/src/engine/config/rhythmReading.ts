/**
 * D27 "Rhythm reading" (R4): its bars, tempos and guides. The click and the
 * grade are the timing engine's (`timing.ts`, M8-01), and the timing windows
 * are the learner's rhythm setting (`rhythm.ts` `windows`), shared with D20
 * and D31.
 */
export const rhythmReading = {
  /**
   * The timing grade's shared parts (`gradeTiming`): the share of notes on
   * time a pass needs, and how far a tap can be from its note and still be
   * that note's (past it, the tap is a stray).
   */
  grade: {
    passRate: 0.8,
    matchMs: 150,
  },
  /**
   * Adaptive scope (research/02 rule 5), one entry per level. `bar` is how
   * the bar around the cell is written:
   *
   * - `blocked`: the cell over and over, as it was first heard;
   * - `contrast`: the cell beside its confusable partner, dotted next to
   *   straight (design §12, rule 6), taking turns;
   * - `mixed`: the cell twice, its partner and plain cells, in any order.
   *
   * `tempo` is the band, in felt beats a minute (quarters in 4/4, dotted
   * quarters in 6/8), a prompt picks its tempo from (rule 12).
   */
  levels: [
    { bar: 'blocked', tempo: [60, 72] },
    { bar: 'contrast', tempo: [60, 72] },
    { bar: 'mixed', tempo: [72, 88] },
    { bar: 'mixed', tempo: [88, 104] },
  ],
  /** Tempos are multiples of this many pulses a minute. */
  tempoStep: 2,
  /**
   * The fastest a bar asks for notes, per minute: sixteenths and triplets
   * slow down to it. Its gap (240 ms) leaves half a note at least as wide as
   * the relaxed on-time window, so a loose tap is never taken for the next
   * note's.
   */
  maxNotesPerMinute: 250,
  /** The meters a bar is written in, per cell feel; a blocked bar uses the first. */
  meters: {
    simple: ['4/4', '3/4', '2/4'],
    compound: ['6/8', '9/8'],
  },
  /** Bars of count-in, then times through the written bar. */
  countInBars: 1,
  bars: 2,
  /**
   * A rep ends this long after its last note's onset window has closed, so
   * a mic onset still being detected isn't cut off.
   */
  endMarginMs: 50,
  /** A right answer's note-by-note marks stay this long before the session moves on. */
  feedbackHoldMs: 2500,
  /** At and above this guide level the count ("1 e & a") is shown under the notes (rule 9). */
  countGuideLevel: 1,
  /** At and above this guide level the cell's notes are ringed, and a caret follows the click. */
  playheadGuideLevel: 2,
  /** At and above this guide level the click sounds the bar's subdivision, not just its beats. */
  subdivideGuideLevel: 2,
} as const;

declare module './index' {
  interface EngineConfig {
    rhythmReading: typeof rhythmReading;
  }
}
