import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D3View } from './D3View';
import { d3Check, d3MakePrompt, d3TapAnswer, type D3Answer, type D3Prompt } from './logic';

const prompt = (id: string, accidentalPref: 'sharp' | 'flat' = 'sharp', scopeLevel = 0) =>
  d3MakePrompt(
    { id, skillId: 'F1.test' },
    { tuning: STANDARD_TUNING, accidentalPref, scopeLevel, rng: () => 0 },
  );

interface Opts {
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D3Answer> | null;
  withAside?: boolean;
}

function renderView(p: D3Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <D3View
      prompt={p}
      guideLevel={opts.guideLevel ?? 3}
      guided={opts.guided ?? false}
      handedness="right"
      sizeClass={opts.sizeClass ?? 'regular-wide'}
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={onAnswer}
      aside={opts.withAside === false ? undefined : <aside data-testid="context-panel" />}
    />,
  );
  return { onAnswer, ...utils };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard/ });
const neckTexts = () =>
  Array.from(neck().querySelectorAll('text')).map((t) => t.textContent?.trim() ?? '');
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as Element;
const marker = (style: string, string: number, fret: number) =>
  neck().querySelector(
    `[data-testid="marker-${style}"][data-string="${string}"][data-fret="${fret}"]`,
  );
const tapFeedback = (p: D3Prompt, string: number, fret: number): DrillFeedback<D3Answer> => {
  const answer = d3TapAnswer({ string, fret }, STANDARD_TUNING, p.pref);
  return { answer, result: d3Check(p, answer) };
};

describe('<D3View>', () => {
  it('is registered as the note-wheel drill', async () => {
    expect(await resolveView(getDrill('note-wheel')!.render)).toBe(D3View);
  });

  it('asks the question and answers by button', () => {
    const { onAnswer } = renderView(prompt('step:+2@E'));
    expect(screen.getByText('A whole step above E?')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'A whole step above E?' });
    fireEvent.click(within(group).getByRole('button', { name: 'F♯' }));
    expect(onAnswer).toHaveBeenCalledWith('F#');
  });

  it('answers from the hardware keyboard: A–G, Shift for sharps', () => {
    const { onAnswer } = renderView(prompt('step:+2@E'));
    fireEvent.keyDown(window, { key: 'F', shiftKey: true });
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 'z' });
    expect(onAnswer.mock.calls).toEqual([['F#'], ['G']]);
  });

  it('ignores the keyboard once answered', () => {
    const p = prompt('step:+2@E');
    const { onAnswer } = renderView(p, { feedback: { answer: 'F#', result: d3Check(p, 'F#') } });
    fireEvent.keyDown(window, { key: 'g' });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'F♯' })).toHaveAttribute('data-state', 'correct');
  });

  it('never shows the answer on the neck before an unguided answer, even at guide level 3', () => {
    // The letter after G is A, which is also an open-string name.
    for (const id of ['letter:+1@G', 'step:+2@E', 'step:-1@C', 'letter:-1@F']) {
      const p = prompt(id);
      const { unmount } = renderView(p, { guideLevel: 3 });
      expect(neckTexts(), id).not.toContain(displayPc(p.expectedPc));
      expect(neckTexts(), id).toContain(displayPc(p.from));
      expect(screen.queryByTestId('marker-target')).toBeNull();
      expect(neck().getAttribute('aria-label')).not.toContain(displayPc(p.expectedPc));
      unmount();
    }
  });

  it('shows the answer in the guided worked example', () => {
    renderView(prompt('letter:+1@G'), { guided: true, guideLevel: 0 });
    expect(screen.getByText(/The note after G in the musical alphabet is A\./)).toBeInTheDocument();
    expect(neckTexts()).toContain('A');
  });

  it('shows both positions on the neck after a wrong answer', () => {
    const p = prompt('step:+2@E');
    renderView(p, { feedback: { answer: 'G', result: d3Check(p, 'G') } });
    expect(neckTexts()).toEqual(expect.arrayContaining(['E', 'F♯', 'G']));
    expect(screen.getByRole('button', { name: 'F♯' })).toHaveAttribute('data-state', 'expected');
    expect(screen.getByRole('button', { name: 'G' })).toHaveAttribute('data-state', 'wrong');
  });

  it('answers by tapping the note on any string of the neck', () => {
    const p = prompt('step:+2@E');
    const { onAnswer } = renderView(p);
    expect(screen.getByTestId('d3-hint')).toHaveTextContent(/Tap the note on any string/);
    // String 4 fret 4 is F#: a different string from the drawn step.
    fireEvent.pointerDown(cell(4, 4));
    fireEvent.keyDown(cell(3, 0), { key: 'Enter' });
    expect(onAnswer.mock.calls).toEqual([
      [{ position: { string: 4, fret: 4 }, pc: 'F#', name: 'F#3' }],
      [{ position: { string: 3, fret: 0 }, pc: 'G', name: 'G3' }],
    ]);
  });

  it('keeps note names out of the tap targets before answering', () => {
    for (const id of ['letter:+1@G', 'step:+2@E']) {
      const { unmount } = renderView(prompt(id), { guideLevel: 3 });
      const cells = within(neck()).getAllByRole('button');
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) {
        expect(c.getAttribute('aria-label'), id).toMatch(/^string \d, fret \d+$/);
      }
      unmount();
    }
  });

  it('ignores taps once answered', () => {
    const p = prompt('step:+2@E');
    const { onAnswer } = renderView(p, { feedback: tapFeedback(p, 4, 4) });
    fireEvent.pointerDown(cell(4, 5));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByTestId('d3-hint')).not.toHaveTextContent(/Tap the note on any string/);
  });

  it('marks a wrong tap as wrong and the answer as correct', () => {
    const p = prompt('step:+2@E');
    renderView(p, { feedback: tapFeedback(p, 3, 0) });
    expect(marker('wrong', 3, 0)).toHaveTextContent('G');
    expect(marker('correct', 6, 2)).toHaveTextContent('F♯');
    expect(marker('correct', 3, 11)).toHaveTextContent('F♯');
    expect(screen.getByRole('button', { name: 'G' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'F♯' })).toHaveAttribute('data-state', 'expected');
  });

  it('marks a right tap as correct', () => {
    const p = prompt('step:+2@E');
    renderView(p, { feedback: tapFeedback(p, 4, 4) });
    expect(marker('correct', 4, 4)).toHaveTextContent('F♯');
    expect(marker('correct', 6, 2)).toBeInTheDocument();
    expect(neck().querySelector('[data-testid="marker-wrong"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'F♯' })).toHaveAttribute('data-state', 'correct');
  });

  it('spells the choices with the flat preference', () => {
    renderView(prompt('step:+2@E', 'flat'));
    expect(screen.getByRole('button', { name: 'G♭' })).toBeInTheDocument();
  });

  it('places the panel beside the prompt on iPad landscape', () => {
    renderView(prompt('step:+2@E'));
    const panel = screen.getByTestId('context-panel');
    expect(neck().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('places the panel below the neck in portrait and on compact (where it is a sheet)', () => {
    for (const sizeClass of ['regular', 'compact'] as const) {
      const { unmount } = renderView(prompt('step:+2@E'), { sizeClass });
      const panel = screen.getByTestId('context-panel');
      expect(neck().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      unmount();
    }
    renderView(prompt('step:+2@E'), { sizeClass: 'compact', withAside: false });
    expect(screen.queryByTestId('context-panel')).toBeNull();
    expect(neck()).toHaveAttribute('data-fret-from', '0');
  });

  it('shows ♯ in the question, the buttons and the worked example, but answers ASCII', () => {
    const p = prompt('step:+1@F#');
    const { onAnswer, unmount } = renderView(p);
    expect(screen.getByText('A half step above F♯?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'G' }));
    fireEvent.click(screen.getByRole('button', { name: 'G♯' }));
    expect(onAnswer.mock.calls).toEqual([['G'], ['G#']]);
    expect(screen.queryByRole('button', { name: 'G#' })).toBeNull();
    expect(neckTexts()).toContain('F♯');
    unmount();
    renderView(prompt('step:+2@E'), { guided: true });
    expect(screen.getByText(/A whole step above E is F♯\. Tap/)).toBeInTheDocument();
    expect(neckTexts()).toContain('F♯');
  });

  it('explains a miss under the prompt, and confirms a correct answer', () => {
    const p = prompt('step:+2@E');
    const { unmount } = renderView(p, { feedback: { answer: 'F', result: d3Check(p, 'F') } });
    expect(screen.getByTestId('d3-hint')).toHaveTextContent(
      "You said F, a half step above E. There's no sharp between E and F: a half step above E is F. A whole step is two frets: E F F♯.",
    );
    unmount();
    renderView(p, { feedback: { answer: 'F#', result: d3Check(p, 'F#') } });
    expect(screen.getByTestId('d3-hint')).toHaveTextContent('E to F♯ is two frets on one string.');
  });
});
