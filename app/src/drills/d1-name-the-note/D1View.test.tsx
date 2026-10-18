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
  opts: {
    guideLevel: GuideLevel;
    guided?: boolean;
    feedback?: DrillFeedback<D1Answer>;
    blindMode?: boolean;
  },
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
      blindMode={opts.blindMode}
    />,
  );
  const neck = container.querySelector('svg')!;
  const neckTexts = () => [...neck.querySelectorAll('text')].map((t) => t.textContent);
  const count = (testid: string) => neck.querySelectorAll(`[data-testid="${testid}"]`).length;
  // Inlays are the only circles outside a marker group.
  const inlays = () =>
    [...neck.querySelectorAll('circle')].filter((c) => !c.closest('[data-testid^="marker-"]'))
      .length;
  const labels = (testid: string) =>
    [...neck.querySelectorAll(`[data-testid="${testid}"] text`)].map((t) => t.textContent);
  return { neck, neckTexts, count, inlays, labels };
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

describe('<D1View> guide levels (design §3.5)', () => {
  // String 6, fret 3: G. Naturals F, A, B, C, D around it; the E root at 12.
  const G = prompt({ string: 6, fret: 3 }, 'G', 2);

  it('level 3: every natural on the string labelled, the root highlighted', () => {
    const v = renderD1(G, { guideLevel: 3 });
    expect(v.labels('marker-ghost')).toEqual(['F', 'A', 'B', 'C', 'D', 'F']);
    expect(v.labels('marker-root')).toEqual(['E']);
    expect(v.count('string-name')).toBe(6);
    expect(v.inlays()).toBeGreaterThan(0);
  });

  it('level 2: only the root highlighted', () => {
    const v = renderD1(G, { guideLevel: 2 });
    expect(v.count('marker-ghost')).toBe(0);
    expect(v.labels('marker-root')).toEqual(['E']);
    expect(v.count('string-name')).toBe(6);
  });

  it('level 1: fret inlays only', () => {
    const v = renderD1(G, { guideLevel: 1, blindMode: true });
    expect(v.count('marker-ghost') + v.count('marker-root') + v.count('string-name')).toBe(0);
    expect(v.inlays()).toBeGreaterThan(0);
    expect(v.count('marker-target')).toBe(1);
  });

  it('level 0: a bare neck, with inlays off in blind mode', () => {
    const v = renderD1(G, { guideLevel: 0 });
    expect(v.count('marker-ghost') + v.count('marker-root') + v.count('string-name')).toBe(0);
    expect(v.inlays()).toBeGreaterThan(0);
    const blind = renderD1(G, { guideLevel: 0, blindMode: true });
    expect(blind.inlays()).toBe(0);
    expect(blind.count('marker-target')).toBe(1);
  });

  it('the worked example shows full guides at any level', () => {
    const v = renderD1(G, { guideLevel: 0, guided: true, blindMode: true });
    expect(v.labels('marker-target')).toEqual(['G']);
    expect(v.count('marker-ghost')).toBeGreaterThan(0);
    expect(v.inlays()).toBeGreaterThan(0);
  });

  it('feedback stays on at level 0 in blind mode', () => {
    const feedback = { answer: 'A', result: d1Check(G, 'A') };
    const v = renderD1(G, { guideLevel: 0, blindMode: true, feedback });
    expect(v.labels('marker-correct')).toEqual(['G']);
    expect(v.labels('marker-wrong')).toEqual(['A']);
    expect(v.inlays()).toBe(0);
    expect(screen.getByRole('button', { name: 'G' })).toHaveAttribute('data-state', 'expected');
  });
});
