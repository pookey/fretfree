import type { FretRange, Position } from '../../theory';

/**
 * A worked example (design §7 Learn, research/02 rule 8): a 30-second,
 * interactive lead-in to practice. The same idea runs three times, with the
 * guides fading each time: worked → faded → independent.
 */

export type ExampleStage = 'worked' | 'faded' | 'independent';

export interface ExampleTrap {
  /** The tempting wrong cell, e.g. an octave shape without the G–B shift. */
  readonly at: Position;
  /** The note there, spelt as the interval it forms from the root (C → Eb, not D#). */
  readonly name: string;
  /** Why it's wrong (research/03 misconception), shown when the learner taps it. */
  readonly message: string;
}

export interface ExampleStep {
  /** The question, e.g. "Find the octave of G on string 2." */
  readonly prompt: string;
  /** Notes the prompt starts from. They are the stimulus, so they stay labelled. */
  readonly given: readonly Position[];
  /** The cell to tap. */
  readonly answer: Position;
  /** Why it's right: shown up front when worked, after the tap otherwise. */
  readonly explain: string;
  /** A short cue, shown at the faded stage only. */
  readonly hint: string;
  readonly trap?: ExampleTrap;
}

export interface WorkedExample {
  readonly id: string;
  /**
   * Skill IDs or topic IDs (research/03) the example teaches. A skill-ID
   * match wins over a topic match, so a topic-wide example can be refined
   * per skill later.
   */
  readonly for: readonly string[];
  readonly title: string;
  /** The idea in one line, shown above the neck. */
  readonly idea: string;
  /**
   * A fixed neck window for every step. Required when steps have no given
   * note (e.g. F2 landmarks, shown from the nut), so the window can't give
   * the answer away.
   */
  readonly range?: FretRange;
  /** Worked, faded and independent, in that order. */
  readonly steps: readonly [ExampleStep, ExampleStep, ExampleStep];
}
