import type { FretMarker } from '../../components/fretboard/Fretboard';
import { ENGINE_CONFIG, type GuideLevel } from '../../engine';
import {
  MAX_FRET,
  STANDARD_TUNING,
  noteAt,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import type { ExampleStage, ExampleStep, WorkedExample } from './types';

/** Pure state and view logic of a worked example; the view only renders it. */

export const STAGES: readonly ExampleStage[] = ['worked', 'faded', 'independent'];

export const STAGE_LABEL: Readonly<Record<ExampleStage, string>> = {
  worked: 'Worked example',
  faded: 'Your turn, with a hint',
  independent: 'On your own',
};

export interface ExampleState {
  /** 0 worked, 1 faded, 2 independent. */
  readonly step: number;
  /** The learner's answer on this step; null until they tap. */
  readonly tapped: Position | null;
  /** Worked stage only: they tapped somewhere other than the shown answer. */
  readonly nudge: boolean;
}

export const START: ExampleState = { step: 0, tapped: null, nudge: false };

export type Outcome = 'correct' | 'trap' | 'wrong';

const same = (a: Position, b: Position) => a.string === b.string && a.fret === b.fret;

export function stageOf(state: ExampleState): ExampleStage {
  return STAGES[state.step] ?? 'independent';
}

export function stageGuideLevel(stage: ExampleStage): GuideLevel {
  return ENGINE_CONFIG.workedExamples.stageGuideLevels[stage];
}

export function currentStep(example: WorkedExample, state: ExampleState): ExampleStep {
  return example.steps[state.step] ?? example.steps[2];
}

export function outcomeOf(step: ExampleStep, tapped: Position): Outcome {
  if (same(tapped, step.answer)) return 'correct';
  return step.trap && same(tapped, step.trap.at) ? 'trap' : 'wrong';
}

/**
 * A tap on the neck. The worked stage takes only the shown answer (anything
 * else nudges); later stages take any cell as the answer. A step takes one
 * answer: immediate feedback, then on (research/02 rule 9).
 */
export function tapCell(example: WorkedExample, state: ExampleState, pos: Position): ExampleState {
  if (state.tapped) return state;
  if (stageOf(state) === 'worked' && !same(pos, currentStep(example, state).answer)) {
    return { ...state, nudge: true };
  }
  return { ...state, tapped: pos, nudge: false };
}

/** On to the next stage once this one is answered. */
export function nextStep(state: ExampleState): ExampleState {
  if (!state.tapped || state.step >= STAGES.length - 1) return state;
  return { step: state.step + 1, tapped: null, nudge: false };
}

/** The independent stage is answered: the example is over. */
export function isComplete(state: ExampleState): boolean {
  return state.step >= STAGES.length - 1 && state.tapped !== null;
}

/**
 * The neck window for a step: its notes (trap included) plus context frets.
 * Each step gets its own, so the notes stay in view in a half-width pane
 * without shrinking cells below 44pt.
 */
export function stepRange(step: ExampleStep): FretRange {
  const { rangePadding, minFrets } = ENGINE_CONFIG.workedExamples;
  const frets = [...step.given.map((p) => p.fret), step.answer.fret];
  if (step.trap) frets.push(step.trap.at.fret);
  let from = Math.max(0, Math.min(...frets) - rangePadding);
  let to = Math.min(MAX_FRET, Math.max(...frets) + rangePadding);
  while (to - from + 1 < minFrets) {
    if (from > 0) from--;
    if (to - from + 1 < minFrets && to < MAX_FRET) to++;
  }
  return { from, to };
}

/** Pitch names to play when an answer is revealed: the given notes, then the answer. */
export function exampleSounds(step: ExampleStep, tuning: Tuning = STANDARD_TUNING): string[] {
  return [...step.given, step.answer].map((p) => noteAt(p, tuning).name);
}

/**
 * The neck's markers for the current stage. Given notes stay labelled (the
 * prompt names them). The answer shows only on the worked stage, with the
 * shape it replaces as a ghost; later stages reveal it after the tap.
 */
export function exampleMarkers(
  example: WorkedExample,
  state: ExampleState,
  opts: { tuning?: Tuning; pref?: AccidentalPref } = {},
): FretMarker[] {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const pc = (p: Position) => noteAt(p, tuning, opts.pref).pc;
  const step = currentStep(example, state);
  const markers: FretMarker[] = step.given.map((p) => ({
    ...p,
    style: 'root',
    label: pc(p),
    forceLabel: true,
  }));
  if (state.tapped) {
    markers.push({ ...step.answer, style: 'correct', label: pc(step.answer), forceLabel: true });
    if (!same(state.tapped, step.answer)) {
      markers.push({ ...state.tapped, style: 'wrong', label: pc(state.tapped), forceLabel: true });
    }
  } else if (stageOf(state) === 'worked') {
    markers.push({ ...step.answer, style: 'target', label: pc(step.answer), forceLabel: true });
    if (step.trap) markers.push({ ...step.trap.at, style: 'ghost', label: pc(step.trap.at) });
  }
  return markers;
}
