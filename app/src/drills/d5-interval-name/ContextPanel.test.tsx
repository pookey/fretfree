import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import { IntervalContextPanel } from './ContextPanel';
import intervalName from './drill';
import { d5Check, d5MakePrompt, type D5Answer, type D5Prompt } from './logic';
import { resolveView } from '../lazy-view';

const prompt = (id = 'interval-name:M3@s6→s5', scopeLevel = 0) =>
  d5MakePrompt(
    { id, skillId: 'C3.thirds' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
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
  it('is the D5 plugin’s context panel', async () => {
    expect(await resolveView(intervalName.contextPanel!)).toBe(IntervalContextPanel);
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

  describe('at a wide scope', () => {
    it('packs every interval onto one line, keeping "half steps" for screen readers', () => {
      panel(prompt('interval-name:M3@s6→s5', 2), { guideLevel: 3 });
      expect(legend()).toHaveAttribute('data-layout', 'lines');
      expect(legend().querySelectorAll('li')).toHaveLength(12);
      // Seen as `M3 major 3rd · 4`; the dot is hidden from screen readers.
      expect(legendRow('M3')).toHaveTextContent('M3major 3rd· 4 half steps');
      expect(legendRow('M3')!.querySelector('[aria-hidden="true"]')).toHaveTextContent('·');
      expect(legendRow('M3')!.querySelector('.visually-hidden')).toHaveTextContent('half steps');
      expect(legendRow('m2')).toHaveTextContent('1 half step');
      expect(legendRow('m2')).not.toHaveTextContent('half steps');
    });

    it('drops the count tip but keeps the G–B tip', () => {
      const plain = panel(prompt('interval-name:M3@s6→s5', 2), { guideLevel: 3 });
      expect(plain.container.querySelectorAll('p')).toHaveLength(0);
      plain.unmount();
      const gb = panel(prompt('interval-name:M3@s3→s2', 2), { guideLevel: 3 });
      expect(gb.container).not.toHaveTextContent(/Count half steps/);
      expect(gb.container).toHaveTextContent(/crosses from G to B/);
    });

    it('still marks the answer by mark and border style in feedback', () => {
      const p = prompt('interval-name:M3@s6→s5', 2);
      panel(p, { guideLevel: 3, feedback: fb(p, 'P8') });
      expect(legendRow('M3')).toHaveAttribute('data-state', 'expected');
      expect(legendRow('P8')).toHaveAttribute('data-state', 'wrong');
    });

    it('fades the counts with the guide level', () => {
      panel(prompt('interval-name:M3@s6→s5', 1), { guideLevel: 1 });
      expect(legend()).toHaveAttribute('data-layout', 'lines');
      expect(legendRow('M3')).toHaveTextContent(/^M3major 3rd$/);
    });

    it('keeps the stacked rows at four choices', () => {
      panel(prompt(), { guideLevel: 3 });
      expect(legend()).toHaveAttribute('data-layout', 'stacked');
    });
  });
});
