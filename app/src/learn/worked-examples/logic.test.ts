import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine';
import {
  START,
  currentStep,
  exampleMarkers,
  exampleSounds,
  isComplete,
  nextStep,
  outcomeOf,
  stageGuideLevel,
  stageOf,
  stepRange,
  tapCell,
  type ExampleState,
} from './logic';
import { landmarkStep, shapeStep } from './shapes';
import type { WorkedExample } from './types';

const gb: WorkedExample = {
  id: 'test-gb',
  for: ['C2.all-notes'],
  title: 'Octaves across G–B',
  idea: 'Up one fret.',
  steps: [
    shapeStep({ string: 4, fret: 5 }, 'P8', 2),
    shapeStep({ string: 3, fret: 2 }, 'P8', 1),
    shapeStep({ string: 4, fret: 7 }, 'P8', 2),
  ],
};

const s2f8 = { string: 2, fret: 8 };
const s2f7 = { string: 2, fret: 7 };

function answered(state: ExampleState): ExampleState {
  return tapCell(gb, state, currentStep(gb, state).answer);
}

describe('worked example stages', () => {
  it('runs worked → faded → independent, fading the guides', () => {
    let s = START;
    const seen = [];
    for (;;) {
      seen.push([stageOf(s), stageGuideLevel(stageOf(s))]);
      s = answered(s);
      if (isComplete(s)) break;
      s = nextStep(s);
    }
    expect(seen).toEqual([
      ['worked', 3],
      ['faded', 2],
      ['independent', 1],
    ]);
    expect(stageGuideLevel('worked')).toBe(ENGINE_CONFIG.workedExamples.stageGuideLevels.worked);
  });

  it('only takes the shown answer on the worked stage, nudging otherwise', () => {
    const nudged = tapCell(gb, START, s2f7);
    expect(nudged).toEqual({ step: 0, tapped: null, nudge: true });
    expect(tapCell(gb, nudged, s2f8)).toEqual({ step: 0, tapped: s2f8, nudge: false });
  });

  it('takes any cell as the answer once faded, and only one answer per step', () => {
    const faded = nextStep(answered(START));
    const wrong = tapCell(gb, faded, { string: 1, fret: 4 });
    expect(wrong.tapped).toEqual({ string: 1, fret: 4 });
    expect(tapCell(gb, wrong, { string: 1, fret: 5 })).toBe(wrong);
  });

  it('does not move on before an answer or past the last stage', () => {
    expect(nextStep(START)).toBe(START);
    const last = answered(nextStep(answered(nextStep(answered(START)))));
    expect(isComplete(last)).toBe(true);
    expect(nextStep(last)).toBe(last);
    expect(isComplete(START)).toBe(false);
  });

  it('falls back to the last step for an out-of-range state', () => {
    expect(currentStep(gb, { step: 9, tapped: null, nudge: false })).toBe(gb.steps[2]);
    expect(stageOf({ step: 9, tapped: null, nudge: false })).toBe('independent');
  });
});

describe('outcomeOf', () => {
  const step = gb.steps[0];
  it('tells the right answer, the targeted misconception and other mistakes apart', () => {
    expect(outcomeOf(step, s2f8)).toBe('correct');
    expect(outcomeOf(step, s2f7)).toBe('trap');
    expect(outcomeOf(step, { string: 3, fret: 8 })).toBe('wrong');
    expect(outcomeOf(landmarkStep('G', 6, 'x'), { string: 6, fret: 2 })).toBe('wrong');
  });
});

describe('exampleMarkers', () => {
  it('shows the answer and the unshifted shape as a ghost on the worked stage', () => {
    expect(exampleMarkers(gb, START)).toEqual([
      { string: 4, fret: 5, style: 'root', label: 'G', forceLabel: true },
      { string: 2, fret: 8, style: 'target', label: 'G', forceLabel: true },
      { string: 2, fret: 7, style: 'ghost', label: 'F#' },
    ]);
  });

  it('hides the answer until the tap on later stages', () => {
    const faded = nextStep(answered(START));
    expect(exampleMarkers(gb, faded)).toEqual([
      { string: 3, fret: 2, style: 'root', label: 'A', forceLabel: true },
    ]);
  });

  it('reveals the answer, and the wrong tap, after answering', () => {
    const faded = nextStep(answered(START));
    const right = answered(faded);
    expect(exampleMarkers(gb, right).map((m) => m.style)).toEqual(['root', 'correct']);
    const wrong = tapCell(gb, faded, { string: 1, fret: 4 });
    expect(exampleMarkers(gb, wrong, { pref: 'flat' })).toEqual([
      { string: 3, fret: 2, style: 'root', label: 'A', forceLabel: true },
      { string: 1, fret: 5, style: 'correct', label: 'A', forceLabel: true },
      { string: 1, fret: 4, style: 'wrong', label: 'Ab', forceLabel: true },
    ]);
  });

  it('marks nothing extra for an example without given notes or traps', () => {
    const f2: WorkedExample = {
      ...gb,
      steps: [landmarkStep('G', 6, 'x'), gb.steps[1], gb.steps[2]],
    };
    expect(exampleMarkers(f2, START)).toEqual([
      { string: 6, fret: 3, style: 'target', label: 'G', forceLabel: true },
    ]);
  });
});

describe('stepRange', () => {
  it('covers the step, trap included, with padding', () => {
    // Root at 5, answer at 8, trap at 7, padded by one.
    expect(stepRange(gb.steps[0])).toEqual({ from: 4, to: 9 });
  });

  it('widens short steps to the minimum, without going past either end of the neck', () => {
    const at = (fret: number) => ({ ...landmarkStep('F', 6, 'x'), answer: { string: 6, fret } });
    expect(stepRange(at(1))).toEqual({ from: 0, to: ENGINE_CONFIG.workedExamples.minFrets - 1 });
    expect(stepRange(at(24))).toEqual({ from: 25 - ENGINE_CONFIG.workedExamples.minFrets, to: 24 });
    expect(stepRange(at(12))).toEqual({ from: 10, to: 14 });
  });
});

describe('exampleSounds', () => {
  it('plays the given notes, then the answer', () => {
    expect(exampleSounds(gb.steps[0])).toEqual(['G3', 'G4']);
    expect(exampleSounds(landmarkStep('A', 6, 'x'))).toEqual(['A2']);
  });
});
