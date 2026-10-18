import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D5View } from './D5View';
import { d5Check, d5MakePrompt, type D5Answer, type D5Prompt } from './logic';

const prompt = (id = 'interval-name:M3@s6→s5', scopeLevel = 0) =>
  d5MakePrompt(
    { id, skillId: 'C3.thirds' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

interface Opts {
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D5Answer> | null;
  withAside?: boolean;
}

function renderView(p: D5Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <D5View
      prompt={p}
      guideLevel={opts.guideLevel ?? 3}
      guided={opts.guided ?? false}
      handedness="right"
      sizeClass={opts.sizeClass ?? 'regular-wide'}
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={onAnswer}
      aside={opts.withAside === false ? undefined : <aside />}
    />,
  );
  return { onAnswer, ...utils };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard/ });
const markers = (style: string) =>
  Array.from(neck().querySelectorAll(`[data-testid="marker-${style}"]`)).map((m) => ({
    string: Number(m.getAttribute('data-string')),
    fret: Number(m.getAttribute('data-fret')),
    text: m.textContent?.trim() ?? '',
  }));
const fb = (p: D5Prompt, answer: D5Answer) => ({ answer, result: d5Check(p, answer) });
const legend = () => screen.queryByTestId('interval-legend');
const legendRow = (name: string) =>
  legend()?.querySelector(`[data-interval="${name}"]`) as HTMLElement | null;

describe('<D5View>', () => {
  it('is registered as the interval-name drill for every C3 skill', () => {
    const drill = getDrill('interval-name');
    expect(drill?.render).toBe(D5View);
    expect(drill?.inputModes).toContain('choice');
  });

  it('shows the root as a square and the upper note as an unlabelled target', () => {
    renderView(prompt(), { guideLevel: 3 });
    expect(markers('root')).toEqual([{ string: 6, fret: 2, text: 'F#' }]);
    expect(markers('target')).toEqual([{ string: 5, fret: 1, text: '' }]);
    expect(screen.getByText('Name the interval')).toBeInTheDocument();
  });

  it('answers by button, among the scope level’s choices', () => {
    const { onAnswer } = renderView(prompt());
    const group = screen.getByRole('group', { name: 'Name the interval' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['m2', 'M2', 'm3', 'M3']);
    fireEvent.click(within(group).getByRole('button', { name: 'M3' }));
    expect(onAnswer).toHaveBeenCalledWith('M3');
  });

  it('shows all twelve intervals at the widest scope', () => {
    renderView(prompt('interval-name:P5@s5→s4', 2));
    const group = screen.getByRole('group', { name: 'Name the interval' });
    expect(within(group).getAllByRole('button')).toHaveLength(12);
    expect(within(group).getByRole('button', { name: 'P8' })).toHaveAttribute(
      'aria-keyshortcuts',
      '=',
    );
  });

  it('answers from the number row, and ignores modified keys', () => {
    const { onAnswer } = renderView(prompt());
    fireEvent.keyDown(window, { key: '4' });
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    fireEvent.keyDown(window, { key: 'z' });
    expect(onAnswer.mock.calls).toEqual([['M3']]);
  });

  it('ignores the keyboard once answered', () => {
    const p = prompt();
    const { onAnswer } = renderView(p, { feedback: fb(p, 'M3') });
    fireEvent.keyDown(window, { key: '4' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('names the interval in the worked example', () => {
    renderView(prompt(), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d5-drill')).toHaveTextContent(
      'This is a major 3rd (M3), 4 half steps up from F#. Tap M3 to continue.',
    );
    expect(markers('target')).toEqual([{ string: 5, fret: 1, text: 'M3' }]);
    // The worked example shows full guides, so the legend has its tips.
    expect(screen.getByTestId('interval-legend')).toHaveAttribute('data-level', '3');
  });

  it('marks a right answer on the neck and in the legend', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'M3') });
    expect(markers('correct')).toEqual([{ string: 5, fret: 1, text: 'M3' }]);
    expect(markers('wrong')).toEqual([]);
    expect(screen.getByRole('button', { name: 'M3' })).toHaveAttribute('data-state', 'correct');
    expect(legendRow('M3')).toHaveAttribute('data-state', 'expected');
    expect(screen.getByTestId('d5-hint')).toBeEmptyDOMElement();
  });

  it('marks a wrong answer where it would be, and the right one', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'm3') });
    expect(markers('correct')).toEqual([{ string: 5, fret: 1, text: 'M3' }]);
    expect(markers('wrong')).toEqual([{ string: 5, fret: 0, text: 'm3' }]);
    expect(screen.getByRole('button', { name: 'm3' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'M3' })).toHaveAttribute('data-state', 'expected');
    expect(legendRow('m3')).toHaveAttribute('data-state', 'wrong');
    expect(legendRow('M3')).toHaveAttribute('data-state', 'expected');
  });

  describe('interval legend in the context panel', () => {
    it('lists names, half steps and tips at guide level 3', () => {
      renderView(prompt(), { guideLevel: 3 });
      const panel = screen.getByTestId('context-panel');
      expect(within(panel).getByRole('heading', { name: 'Intervals' })).toBeInTheDocument();
      expect(legendRow('M3')).toHaveTextContent('M3major 3rd4 half steps');
      expect(legendRow('m2')).toHaveTextContent('1 half step');
      expect(panel).toHaveTextContent(/from G to B/);
    });

    it('drops the tips at level 2', () => {
      renderView(prompt(), { guideLevel: 2 });
      expect(legendRow('M3')).toHaveTextContent('4 half steps');
      expect(screen.getByTestId('context-panel')).not.toHaveTextContent(/from G to B/);
    });

    it('only decodes the names at level 1', () => {
      renderView(prompt(), { guideLevel: 1 });
      expect(legendRow('M3')).toHaveTextContent(/^M3major 3rd$/);
      expect(screen.getByTestId('context-panel')).not.toHaveTextContent(/half step/);
    });

    it('is absent when the session withholds the panel', () => {
      renderView(prompt(), { withAside: false });
      expect(screen.queryByTestId('context-panel')).toBeNull();
    });

    it('sits below the neck on iPad portrait, and not at all on compact', () => {
      const { unmount } = renderView(prompt(), { sizeClass: 'regular' });
      const drill = screen.getByTestId('d5-drill');
      expect(drill.lastElementChild).toBe(screen.getByTestId('context-panel'));
      unmount();
      renderView(prompt(), { sizeClass: 'compact' });
      expect(screen.queryByTestId('context-panel')).toBeNull();
    });
  });
});
