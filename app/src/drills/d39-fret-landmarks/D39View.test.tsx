import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D39View } from './D39View';
import { d39Check, d39MakePrompt, type D39Answer, type D39Prompt } from './logic';

const prompt = (id: string, scopeLevel = 0) =>
  d39MakePrompt(
    { id, skillId: 'F3.markers' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );
const fb = (p: D39Prompt, answer: D39Answer): DrillFeedback<D39Answer> => ({
  answer,
  result: d39Check(p, answer),
});

interface Opts {
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D39Answer> | null;
  withAside?: boolean;
}

function renderView(p: D39Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <D39View
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
const dimmedFrets = () => neck().querySelectorAll('[data-testid="dimmed-fret"]').length;
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as Element;
const markers = (style: string) =>
  Array.from(neck().querySelectorAll(`[data-testid="marker-${style}"]`));
const buttons = () =>
  within(screen.getByRole('group', { name: /^(?!Fretboard)/ }))
    .getAllByRole('button')
    .map((b) => b.textContent);

describe('<D39View>', () => {
  it('is registered as the fret-landmarks drill', async () => {
    expect(await resolveView(getDrill('fret-landmarks')!.render)).toBe(D39View);
  });

  it('spotlights one marker and offers the landmark frets, with no fret numbers', () => {
    const { onAnswer } = renderView(prompt('marker:f7'));
    expect(screen.getByText('Which fret is this marker on?')).toBeInTheDocument();
    expect(buttons()).toEqual(['3', '5', '7', '9', '12']);
    // Frets 0–12 drawn, all but the 7th dimmed.
    expect(dimmedFrets()).toBe(12);
    expect(neckTexts().filter((t) => /^\d+$/.test(t))).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Fret 9' }));
    expect(onAnswer).toHaveBeenCalledWith(9);
  });

  it('answers a typed fret number, waiting for a second digit', () => {
    const { onAnswer } = renderView(prompt('marker:f12'));
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByTestId('d39-hint')).toHaveTextContent('Typed 1. Press Enter to answer.');
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith(12);
  });

  it('leaves Enter on a focused button to the button', () => {
    const { onAnswer } = renderView(prompt('marker:f7'));
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'x', metaKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('shows the worked example with the answer on a guided rep', () => {
    renderView(prompt('marker:f5'), { guided: true });
    expect(screen.getByText(/This is the 5th-fret marker\./)).toBeInTheDocument();
    expect(markers('target')).toHaveLength(1);
    expect(neckTexts()).toContain('5');
  });

  it('marks the right fret, and the wrong one, in feedback', () => {
    const p = prompt('marker:f7');
    renderView(p, { feedback: fb(p, 9) });
    expect(screen.getByRole('button', { name: 'Fret 9' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'Fret 7' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    expect(markers('correct').map((m) => m.getAttribute('data-fret'))).toEqual(['7']);
    expect(markers('wrong').map((m) => m.getAttribute('data-fret'))).toEqual(['9']);
  });

  it('finds a marker by tapping any string on its fret', () => {
    const { onAnswer } = renderView(prompt('find-marker:f9'));
    expect(screen.getByText('Tap the 9th-fret marker')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Tap the/ })).toBeNull();
    expect(dimmedFrets()).toBe(0);
    // Tap targets name a string and fret: no marker is labelled for the learner.
    expect(neckTexts().filter((t) => /^\d+$/.test(t))).toEqual([]);
    fireEvent.pointerDown(cell(2, 9));
    expect(onAnswer).toHaveBeenCalledWith(9);
  });

  it('names the spotlit marker for screen readers by its place, not its fret', () => {
    renderView(prompt('marker:f9'));
    expect(
      screen.getByRole('group', { name: 'Fretboard. The 4th marker from the nut is spotlit.' }),
    ).toBeInTheDocument();
  });

  it('finds a marker with the arrow keys and Enter, cells named by their marker', () => {
    const { onAnswer } = renderView(prompt('find-marker:f3'));
    // No tap target names its fret: that would give the answer away.
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '');
    expect(names.some((n) => /fret/.test(n))).toBe(false);
    expect(screen.getAllByRole('button', { name: 'string 3, single-dot marker' })).toHaveLength(4);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(cell(3, 0)).toHaveFocus();
    expect(cell(3, 0)).toHaveAccessibleName('string 3, open strings');
    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(cell(3, 3)).toHaveFocus();
    fireEvent.keyDown(window, { key: 'x' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith(3);
  });

  it('leaves Enter and Space on another button to that button', () => {
    const { onAnswer } = renderView(prompt('find-marker:f3'));
    render(<button type="button">End session</button>);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(cell(3, 0)).toHaveFocus();
    const quit = screen.getByRole('button', { name: 'End session' });
    fireEvent.keyDown(quit, { key: 'Enter' });
    fireEvent.keyDown(quit, { key: ' ' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('answers once when Enter lands on the focused cell itself', () => {
    const { onAnswer } = renderView(prompt('find-marker:f5'));
    fireEvent.keyDown(window, { key: 'End' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'End' });
    expect(cell(3, 12)).toHaveFocus();
    fireEvent.keyDown(cell(3, 12), { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(12);
  });

  it('spotlights the sought marker on a guided find, and stops taking taps in feedback', () => {
    const p = prompt('find-marker:f3');
    renderView(p, { guided: true });
    expect(
      screen.getByText(/The 3rd-fret marker is here\. Tap it to continue\./),
    ).toBeInTheDocument();
    expect(dimmedFrets()).toBe(12);
  });

  it('ignores taps once answered', () => {
    const p = prompt('find-marker:f3');
    const { onAnswer } = renderView(p, { feedback: fb(p, 5) });
    expect(cell(1, 5).getAttribute('role')).toBeNull();
    fireEvent.pointerDown(cell(1, 5));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('asks where a fret repeats, with its notes marked and the other octave hidden', () => {
    const p = prompt('repeat:+12@f3');
    const { onAnswer } = renderView(p);
    expect(
      screen.getByText('Which fret has the same notes as fret 3, an octave higher?'),
    ).toBeInTheDocument();
    expect(buttons()).toEqual(['12', '15', '17', '19', '21', '24']);
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    expect(markers('root')).toHaveLength(6);
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '5' });
    expect(onAnswer).toHaveBeenCalledWith(15);
  });

  it('shows both frets of a repeat side by side in feedback, notes named', () => {
    const p = prompt('repeat:+12@f3');
    renderView(p, { feedback: fb(p, 15), guideLevel: 0 });
    expect(neck()).toHaveAttribute('data-fret-from', '3');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
    const labels = (style: string) => markers(style).map((m) => m.textContent);
    expect(labels('root')).toEqual(['G', 'D', 'A#', 'F', 'C', 'G']);
    expect(labels('correct')).toEqual(labels('root'));
  });

  it('labels the open string and leaves the nut to name it', () => {
    const p = prompt('repeat:-12@f12');
    renderView(p);
    expect(screen.getByRole('button', { name: 'Open string' })).toHaveTextContent('Open');
    expect(neck()).toHaveAttribute('data-fret-from', '12');
    const open = prompt('repeat:+12@f0');
    renderView(open, { guided: true });
    expect(screen.getAllByText(/the open strings/).length).toBeGreaterThan(0);
  });

  it('places the context panel beside the prompt on iPad landscape', () => {
    renderView(prompt('marker:f3'));
    const panel = screen.getByTestId('context-panel');
    expect(neck().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('places the context panel below the neck off regular-wide, and omits it when hidden', () => {
    const { container, unmount } = renderView(prompt('marker:f3'), { sizeClass: 'compact' });
    const drill = container.firstElementChild!;
    expect(drill.lastElementChild).toHaveAttribute('data-testid', 'context-panel');
    unmount();
    renderView(prompt('marker:f3'), { withAside: false });
    expect(screen.queryByTestId('context-panel')).toBeNull();
  });
});
