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
      { string: 2, fret: 7, style: 'ghost', label: 'F♯' },
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
    const wrong = tapCell(gb, faded, { string: 1, fret: 2 });
    expect(exampleMarkers(gb, wrong, { pref: 'flat' })).toEqual([
      { string: 3, fret: 2, style: 'root', label: 'A', forceLabel: true },
      { string: 1, fret: 5, style: 'correct', label: 'A', forceLabel: true },
      { string: 1, fret: 2, style: 'wrong', label: 'G♭', forceLabel: true },
    ]);
    // Fret 4 is the unshifted shape: the trap, a major 7th from A, so G♯
    // even for a flats learner, as the feedback names it.
    const trap = tapCell(gb, faded, { string: 1, fret: 4 });
    expect(exampleMarkers(gb, trap, { pref: 'flat' })).toContainEqual({
      string: 1,
      fret: 4,
      style: 'wrong',
      label: 'G♯',
      forceLabel: true,
    });
  });

  it('labels a tapped trap with its own spelling, whatever the preference', () => {
    // C → the major 3rd on the B string. Without the G–B shift the shape
    // lands a fret low: a minor 3rd, E♭, which a sharps learner would see as D♯.
    const thirds: WorkedExample = {
      ...gb,
      steps: [
        shapeStep({ string: 3, fret: 5 }, 'M3', 2),
        shapeStep({ string: 3, fret: 5 }, 'M3', 2),
        shapeStep({ string: 3, fret: 5 }, 'M3', 2),
      ],
    };
    const faded = nextStep(tapCell(thirds, START, currentStep(thirds, START).answer));
    const trap = currentStep(thirds, faded).trap;
    expect(trap?.name).toBe('Eb');
    const tapped = tapCell(thirds, faded, trap!.at);
    const wrong = exampleMarkers(thirds, tapped, { pref: 'sharp' }).find(
      (m) => m.style === 'wrong',
    );
    expect(wrong).toMatchObject({ ...trap!.at, label: 'E♭' });
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
  const { lead, span } = ENGINE_CONFIG.workedExamples;

  it('anchors on the given note with a fixed span, not on the answer', () => {
    // Root at fret 5: the window is 3–9 whatever the shape's answer is.
    expect(stepRange(gb.steps[0])).toEqual({ from: 5 - lead, to: 5 - lead + span - 1 });
    const third = shapeStep({ string: 4, fret: 5 }, 'M3', 3);
    expect(stepRange(third)).toEqual(stepRange(gb.steps[0]));
  });

  it('stops at the nut and at the last fret', () => {
    expect(stepRange(gb.steps[1])).toEqual({ from: 0, to: span - 1 });
    const high = {
      ...gb.steps[0],
      given: [{ string: 4, fret: 22 }],
      answer: { string: 2, fret: 24 },
    };
    expect(stepRange({ ...high, trap: undefined })).toEqual({ from: 24 - span + 1, to: 24 });
  });

  it('widens to cover a wide shape, with a fret to spare', () => {
    // A major 7th on the next string is six frets up: fret 9 from fret 3.
    const wide = shapeStep({ string: 6, fret: 3 }, 'M7', 5);
    expect(stepRange(wide)).toEqual({ from: 1, to: wide.answer.fret + 1 });
  });

  it('shows a step without given notes from the nut, unless the example pins a window', () => {
    const at = (fret: number) => ({ ...landmarkStep('F', 6, 'x'), answer: { string: 6, fret } });
    expect(stepRange(at(1))).toEqual({ from: 0, to: span - 1 });
    expect(stepRange(at(9))).toEqual({ from: 0, to: 10 });
    expect(stepRange(at(1), { from: 0, to: 9 })).toEqual({ from: 0, to: 9 });
  });
});

describe('exampleSounds', () => {
  it('plays the given notes, then the answer', () => {
    expect(exampleSounds(gb.steps[0])).toEqual(['G3', 'G4']);
    expect(exampleSounds(landmarkStep('A', 6, 'x'))).toEqual(['A2']);
  });
});
