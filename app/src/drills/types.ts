import type { FC, ReactNode } from 'react';
import type { GuideLevel, Handedness, Item } from '../engine/model';
import type { AccidentalPref, Position, Tuning } from '../theory';
import type { SizeClass } from '../shell/size-class';

/** Design §6: the drill plugin interface. */

export type InputMode = 'tap' | 'choice' | 'mic' | 'keyboard';

export interface DrillContext {
  tuning: Tuning;
  accidentalPref: AccidentalPref;
  /** Adaptive-scope level (design §3.3 step 4); its meaning is drill-specific. */
  scopeLevel: number;
  rng: () => number;
}

export interface DrillCheck {
  correct: boolean;
  /** Human-readable expected answer, e.g. `A`. */
  expected: string;
  /** The concept the learner confused the expected answer with, for the confusion matrix. */
  confusedWith?: string;
  /**
   * The expected answer's concept in the confusion matrix, when `expected` is
   * display text (D9: `caged:A` for "the A shape of C"). Defaults to `expected`.
   */
  concept?: string;
}

export interface DrillFeedback<A> {
  answer: A;
  result: DrillCheck;
}

export interface DrillRenderProps<P, A> {
  prompt: P;
  guideLevel: GuideLevel;
  /** First rep of a new item: show the worked example / full guides. */
  guided: boolean;
  handedness: Handedness;
  sizeClass: SizeClass;
  /** Compact only: the neck window's width in frets (wider on a phone on its side). */
  compactFrets?: number;
  tuning: Tuning;
  /** Set once the learner has answered; the view shows correct/wrong feedback. */
  feedback: DrillFeedback<A> | null;
  onAnswer(answer: A): void;
  /** Blind mode: at guide level 0 the neck hides its inlays too (design §3.5). */
  blindMode?: boolean;
  /**
   * The session's context panel. Drills place it beside their prompt area so
   * the neck can span the full width below (design §7 iPad landscape).
   */
  aside?: ReactNode;
}

/** What a drill's own context panel is drawn from (design §7 session context panel). */
export interface DrillContextPanelProps<P, A> {
  prompt: P;
  guideLevel: GuideLevel;
  guided: boolean;
  handedness: Handedness;
  tuning: Tuning;
  feedback: DrillFeedback<A> | null;
}

export interface DrillSounds {
  expected: string[];
  given?: string[];
}

export interface DrillType<P = unknown, A = unknown> {
  id: string;
  title: string;
  /** Skill IDs this drill can test. */
  skills: readonly string[];
  inputModes: readonly InputMode[];
  scope: { minLevel: number; maxLevel: number };
  canTest(item: Item): boolean;
  /** Pure: builds the prompt for an item. */
  makePrompt(item: Item, ctx: DrillContext): P;
  check(prompt: P, answer: A): DrillCheck;
  /** Stored as `answerGiven` in the review log. */
  describeAnswer(answer: A): string;
  /** Notes to play: the correct pitch always, and the chosen pitch when wrong (design §7). */
  sounds(prompt: P, feedback: DrillFeedback<A>): DrillSounds;
  /** Positions to show on the neck in feedback, for "sound, sight and name together". */
  feedbackPositions?(
    prompt: P,
    feedback: DrillFeedback<A>,
    tuning: Tuning,
  ): { expected: Position[]; given: Position[] };
  /**
   * The response time to grade and log, from the time to the answer. A
   * multi-target drill grades completion time per target, so the usual
   * speed targets apply (design §3.2). Defaults to the time itself.
   */
  gradedResponseMs?(prompt: P, answer: A, elapsedMs: number): number;
  /** The concept an item is keyed by in the confusion matrix (e.g. its pitch class). */
  conceptOf(item: Item, ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>): string | null;
  render: FC<DrillRenderProps<P, A>>;
  /**
   * The contents of the session's context panel for this drill. The session
   * wraps it in the panel, which it hides at guide level 0 (design §3.5);
   * without one, the panel shows the musical alphabet.
   */
  contextPanel?: FC<DrillContextPanelProps<P, A>>;
}

/** A drill with its generic parameters erased, as stored in the registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDrillType = DrillType<any, any>;
