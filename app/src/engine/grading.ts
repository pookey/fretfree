import { Rating, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';

/** Design §3.2: correctness and speed → FSRS rating. */

export interface SpeedTargets {
  targetMs: number;
  fluentTargetMs: number;
}

export interface AnswerOutcome {
  correct: boolean;
  responseMs: number;
  hintUsed?: boolean;
}

export function speedTargets(
  baselineMs: number | null | undefined,
  grading: {
    targetDeltaMs: number;
    fluentDeltaMs: number;
    defaultBaselineMs: number;
  } = ENGINE_CONFIG.grading,
): SpeedTargets {
  const baseline = baselineMs ?? grading.defaultBaselineMs;
  return {
    targetMs: baseline + grading.targetDeltaMs,
    fluentTargetMs: baseline + grading.fluentDeltaMs,
  };
}

export function gradeAnswer(outcome: AnswerOutcome, targets: SpeedTargets): Grade {
  if (!outcome.correct) return Rating.Again;
  let rating: Grade;
  if (outcome.responseMs > targets.targetMs) rating = Rating.Hard;
  else if (outcome.responseMs > targets.fluentTargetMs) rating = Rating.Good;
  else rating = Rating.Easy;
  // Any hint use caps the rating at Hard.
  if (outcome.hintUsed && rating > Rating.Hard) rating = Rating.Hard;
  return rating;
}
