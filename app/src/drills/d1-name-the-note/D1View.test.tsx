import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { noteItemId, type GuideLevel } from '../../engine/model';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D1View } from './D1View';
import { d1Choices, d1Check, type D1Answer, type D1Prompt } from './logic';

function prompt(position: Position, expectedPc: string, octave: number): D1Prompt {
  return {
    itemId: noteItemId(position),
    position,
    expectedPc,
    expectedName: `${expectedPc}${octave}`,
    choices: d1Choices(expectedPc, 0, 'sharp'),
  };
}

// String 6, fret 1: F is neither a string name nor a fret number.
const F = prompt({ string: 6, fret: 1 }, 'F', 2);
// String 5 at the nut: the string label itself would name the answer.
const OPEN_A = prompt({ string: 5, fret: 0 }, 'A', 2);

function renderD1(
  p: D1Prompt,
  opts: { guideLevel: GuideLevel; guided?: boolean; feedback?: DrillFeedback<D1Answer> },
) {
  const { container } = render(
    <D1View
      prompt={p}
      guideLevel={opts.guideLevel}
      guided={opts.guided ?? false}
      handedness="right"
      sizeClass="regular-wide"
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={vi.fn()}
    />,
  );
  const neck = container.querySelector('svg')!;
  const neckTexts = () => [...neck.querySelectorAll('text')].map((t) => t.textContent);
  return { neck, neckTexts };
}

const LEVELS: GuideLevel[] = [0, 1, 2, 3];

describe('<D1View> never shows the answer in a recall prompt (M1-25)', () => {
  it.each(LEVELS)('unguided at guide level %i: no answer on the neck', (level) => {
    const { neck, neckTexts } = renderD1(F, { guideLevel: level });
    expect(screen.getByText('Name the highlighted note')).toBeInTheDocument();
    expect(neck.querySelector('[data-testid="marker-target"] text')).toBeNull();
    expect(neckTexts()).not.toContain('F');
  });

  it.each(LEVELS)(
    'unguided open-string target at guide level %i: no answer on the neck',
    (level) => {
      const { neckTexts } = renderD1(OPEN_A, { guideLevel: level });
      expect(neckTexts()).not.toContain('A');
    },
  );

  it.each(LEVELS)('guided at guide level %i: the worked example labels the target', (level) => {
    const { neck } = renderD1(OPEN_A, { guideLevel: level, guided: true });
    expect(screen.getByText(/^This is/)).toBeInTheDocument();
    expect(neck.querySelector('[data-testid="marker-target"] text')).toHaveTextContent('A');
  });

  it.each(LEVELS)('feedback at guide level %i: correct and wrong cells are labelled', (level) => {
    const feedback = { answer: 'G', result: d1Check(F, 'G') };
    const { neck } = renderD1(F, { guideLevel: level, feedback });
    expect(neck.querySelector('[data-testid="marker-target"]')).toBeNull();
    const correct = [...neck.querySelectorAll('[data-testid="marker-correct"] text')];
    expect(correct.length).toBeGreaterThan(0);
    correct.forEach((t) => expect(t).toHaveTextContent('F'));
    const wrong = [...neck.querySelectorAll('[data-testid="marker-wrong"] text')];
    expect(wrong.length).toBeGreaterThan(0);
    wrong.forEach((t) => expect(t).toHaveTextContent('G'));
  });
});
