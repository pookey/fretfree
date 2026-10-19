import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import { IntervalContextPanel } from './ContextPanel';
import intervalName from './drill';
import { d5Check, d5MakePrompt, type D5Answer, type D5Prompt } from './logic';

const prompt = (id = 'interval-name:M3@s6→s5') =>
  d5MakePrompt(
    { id, skillId: 'C3.thirds' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

const fb = (p: D5Prompt, answer: D5Answer): DrillFeedback<D5Answer> => ({
  answer,
  result: d5Check(p, answer),
});

function panel(
  p: D5Prompt,
  over: { guideLevel?: GuideLevel; guided?: boolean; feedback?: DrillFeedback<D5Answer> } = {},
) {
  return render(
    <IntervalContextPanel
      prompt={p}
      guideLevel={over.guideLevel ?? 3}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.feedback ?? null}
    />,
  );
}

const legend = () => screen.getByTestId('interval-legend');
const legendRow = (name: string) =>
  legend().querySelector(`[data-interval="${name}"]`) as HTMLElement | null;

describe('<IntervalContextPanel>', () => {
  it('is the D5 plugin’s context panel', () => {
    expect(intervalName.contextPanel).toBe(IntervalContextPanel);
  });

  it('lists names, half steps and tips at guide level 3', () => {
    const { container } = panel(prompt(), { guideLevel: 3 });
    expect(screen.getByRole('heading', { name: 'Intervals' })).toBeInTheDocument();
    expect(legendRow('M3')).toHaveTextContent('M3major 3rd4 half steps');
    expect(legendRow('m2')).toHaveTextContent('1 half step');
    expect(container).toHaveTextContent(/Count half steps up from the square/);
    // String 6 to 5 does not cross G–B, so no shift tip.
    expect(container).not.toHaveTextContent(/from G to B/);
    // Nothing is marked before the answer.
    expect(legend().querySelector('[data-state]')).toBeNull();
  });

  it('explains the G–B shift at level 3 only on shapes that cross it', () => {
    const three = panel(prompt('interval-name:M3@s3→s2'), { guideLevel: 3 });
    expect(three.container).toHaveTextContent(/crosses from G to B, which are a major 3rd apart/);
    three.unmount();
    const two = panel(prompt('interval-name:M3@s3→s2'), { guideLevel: 2 });
    expect(two.container).not.toHaveTextContent(/from G to B/);
  });

  it('drops the tips at level 2', () => {
    const { container } = panel(prompt(), { guideLevel: 2 });
    expect(legendRow('M3')).toHaveTextContent('4 half steps');
    expect(container).not.toHaveTextContent(/Count half steps/);
  });

  it('only decodes the names at level 1', () => {
    const { container } = panel(prompt(), { guideLevel: 1 });
    expect(legendRow('M3')).toHaveTextContent(/^M3major 3rd$/);
    expect(container).not.toHaveTextContent(/half step/);
  });

  it('shows full guides in the worked example', () => {
    panel(prompt(), { guided: true, guideLevel: 0 });
    expect(legend()).toHaveAttribute('data-level', '3');
  });

  it('marks a right answer', () => {
    const p = prompt();
    panel(p, { feedback: fb(p, 'M3') });
    expect(legendRow('M3')).toHaveAttribute('data-state', 'expected');
    expect(legend().querySelector('[data-state="wrong"]')).toBeNull();
  });

  it('marks a wrong answer and the right one', () => {
    const p = prompt();
    panel(p, { feedback: fb(p, 'm3') });
    expect(legendRow('m3')).toHaveAttribute('data-state', 'wrong');
    expect(legendRow('M3')).toHaveAttribute('data-state', 'expected');
  });
});
