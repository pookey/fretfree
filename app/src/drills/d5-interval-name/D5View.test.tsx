import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D5View } from './D5View';
import { d5Check, d5MakePrompt, type D5Answer, type D5Prompt } from './logic';
import { resolveView } from '../lazy-view';

const prompt = (id = 'interval-name:M3@s6→s5', scopeLevel = 0, r = 0) =>
  d5MakePrompt(
    { id, skillId: 'C3.thirds' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => r },
  );

interface Opts {
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  compactFrets?: number | undefined;
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
      {...(opts.compactFrets === undefined ? {} : { compactFrets: opts.compactFrets })}
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={onAnswer}
      aside={opts.withAside === false ? undefined : <aside data-testid="context-panel" />}
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

describe('<D5View>', () => {
  it('is registered as the interval-name drill for every C3 skill', async () => {
    const drill = getDrill('interval-name');
    expect(await resolveView(drill!.render)).toBe(D5View);
    expect(drill?.inputModes).toContain('choice');
  });

  it('shows the root as a square and the upper note as an unlabelled target', () => {
    renderView(prompt(), { guideLevel: 3 });
    expect(markers('root')).toEqual([{ string: 6, fret: 2, text: 'F♯' }]);
    expect(markers('target')).toEqual([{ string: 5, fret: 1, text: '' }]);
    expect(screen.getByText('Name the interval')).toBeInTheDocument();
  });

  it('answers by button, among the scope level’s choices', () => {
    const { onAnswer } = renderView(prompt());
    const group = screen.getByRole('group', { name: 'Name the interval' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['m2', 'M2', 'm3', 'M3']);
    fireEvent.click(within(group).getByRole('button', { name: 'M3, major 3rd' }));
    expect(onAnswer).toHaveBeenCalledWith('M3');
  });

  it('shows all twelve intervals at the widest scope', () => {
    renderView(prompt('interval-name:P5@s5→s4', 2));
    const group = screen.getByRole('group', { name: 'Name the interval' });
    expect(within(group).getAllByRole('button')).toHaveLength(12);
    expect(within(group).getByRole('button', { name: 'P8, perfect octave' })).toHaveAttribute(
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
      'This is a major 3rd (M3), 4 half steps up from F♯. Tap M3 to continue.',
    );
    expect(markers('target')).toEqual([{ string: 5, fret: 1, text: 'M3' }]);
  });

  it('marks a right answer on the neck', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'M3') });
    expect(markers('correct')).toEqual([{ string: 5, fret: 1, text: 'M3' }]);
    expect(markers('wrong')).toEqual([]);
    expect(screen.getByRole('button', { name: 'M3, major 3rd' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    // The hint gives way to one confirming line.
    expect(screen.queryByTestId('d5-hint')).toBeNull();
    expect(screen.getByTestId('d5-explain')).toHaveTextContent(
      'Major 3rd: 4 half steps up from F♯.',
    );
  });

  it('marks a wrong answer where it would be, and the right one', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'm3') });
    expect(markers('correct')).toEqual([{ string: 5, fret: 1, text: 'M3' }]);
    expect(markers('wrong')).toEqual([{ string: 5, fret: 0, text: 'm3' }]);
    expect(screen.getByRole('button', { name: 'm3, minor 3rd' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    expect(screen.getByRole('button', { name: 'M3, major 3rd' })).toHaveAttribute(
      'data-state',
      'expected',
    );
  });

  it('announces the explanation in the hint’s live region, which stays mounted', () => {
    const p = prompt();
    const { rerender } = renderView(p, { guideLevel: 1 });
    const region = screen.getByTestId('d5-hint');
    expect(region).toHaveAttribute('aria-live', 'polite');
    rerender(
      <D5View
        prompt={p}
        guideLevel={1}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={STANDARD_TUNING}
        feedback={fb(p, 'm3')}
        onAnswer={() => {}}
      />,
    );
    expect(screen.getByTestId('d5-explain')).toBe(region);
  });

  it('explains a wrong answer under the prompt, even at guide level 0', () => {
    const p = prompt();
    renderView(p, { guideLevel: 0, feedback: fb(p, 'm3') });
    expect(screen.getByTestId('d5-explain')).toHaveTextContent(
      'You chose m3 (a minor 3rd, 3 half steps). From F♯ up to A♯ is 4 half steps: a major 3rd, M3.',
    );
  });

  it('keeps the short names on the buttons, with the name in words in the accessible name', () => {
    renderView(prompt());
    const button = screen.getByRole('button', { name: 'm3, minor 3rd' });
    expect(button).toHaveTextContent(/^m3$/);
  });

  it('fades the hint with the other guides: gone at level 0', () => {
    const { unmount } = renderView(prompt(), { guideLevel: 1 });
    expect(screen.getByTestId('d5-hint')).toHaveTextContent('From the square');
    unmount();
    renderView(prompt(), { guideLevel: 0 });
    expect(screen.getByTestId('d5-hint')).toBeEmptyDOMElement();
  });

  it('widens the compact neck window with compactFrets, keeping both dots in it', () => {
    const p = prompt('interval-name:P4@s5→s4', 0, 0.999);
    for (const compactFrets of [undefined, 8]) {
      const { unmount } = renderView(p, { sizeClass: 'compact', compactFrets });
      const from = Number(neck().getAttribute('data-fret-from'));
      const to = Number(neck().getAttribute('data-fret-to'));
      expect(to - from + 1).toBe(compactFrets ?? 5);
      for (const pos of [p.root, p.upper]) {
        expect(pos.fret).toBeGreaterThanOrEqual(from);
        expect(pos.fret).toBeLessThanOrEqual(to);
      }
      unmount();
    }
  });

  describe('context panel placement', () => {
    it('sits beside the prompt on iPad landscape', () => {
      renderView(prompt());
      const panel = screen.getByTestId('context-panel');
      expect(neck().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });

    it('is absent when the session withholds the panel', () => {
      renderView(prompt(), { withAside: false });
      expect(screen.queryByTestId('context-panel')).toBeNull();
    });

    it('sits after the neck on iPad portrait and compact (where it becomes a sheet)', () => {
      for (const sizeClass of ['regular', 'compact'] as const) {
        const { unmount } = renderView(prompt(), { sizeClass });
        const drill = screen.getByTestId('d5-drill');
        expect(drill.lastElementChild, sizeClass).toBe(screen.getByTestId('context-panel'));
        unmount();
      }
    });
  });

  it('marks a wide scope so the answers sit in rows of six beside a wider panel', () => {
    const { unmount } = renderView(prompt('interval-name:M3@s6→s5', 2));
    expect(screen.getByTestId('d5-drill')).toHaveAttribute('data-wide', 'true');
    expect(screen.getAllByRole('button')).toHaveLength(12);
    unmount();
    renderView(prompt());
    expect(screen.getByTestId('d5-drill')).not.toHaveAttribute('data-wide');
  });
});
